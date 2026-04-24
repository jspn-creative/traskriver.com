import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Logger } from 'pino';
import type { Config } from './config.ts';
import type { HealthStatus } from './server.ts';
import { buildMediamtxYaml } from './mediamtx-config.ts';
import { getPathInfo } from './mediamtx-api.ts';
import { SegmentWatcher } from './segment-watcher.ts';

const POLL_INTERVAL_MS = 5_000;
const STALL_THRESHOLD_POLLS = 15;
const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const CLEAN_UPTIME_MS = 60_000;
const SIGTERM_GRACE_MS = 10_000;
const CODEC_EXPECTED = 'H264' as const;
const PATH_NAME = 'trask';
const POLL_TIMEOUT_MS = 2_000;
const RESTART_WINDOW_MS = 3_600_000;

export interface HealthSnapshot {
	status: HealthStatus;
	rtspConnected: boolean;
	codec: string | null;
	lastSegmentWrittenAgoMs: number | null;
	restartsLast1h: number;
	uptimeMs: number;
}

type State =
	| { kind: 'idle' }
	| { kind: 'spawning' }
	| { kind: 'waitingReady' }
	| {
			kind: 'ready';
			readyAt: number;
			lastBytes: number;
			zeroDeltaPolls: number;
	  }
	| { kind: 'stalled' }
	| { kind: 'shuttingDown' }
	| { kind: 'codecMismatch'; codec: string }
	| { kind: 'fatal' };

export class Supervisor {
	private readonly cfg: Config;
	private readonly log: Logger;
	private readonly bootAt: number = Date.now();
	private readonly restartTimestamps: number[] = [];
	private state: State = { kind: 'idle' };
	private child: ChildProcess | null = null;
	private backoffMs = BACKOFF_INITIAL_MS;
	private restartTimer: NodeJS.Timeout | null = null;
	private pollTimer: NodeJS.Timeout | null = null;
	private intentionalStop = false;
	private lastCodec: string | null = null;
	private segmentWatcher: SegmentWatcher | null = null;

	constructor(cfg: Config, log: Logger) {
		this.cfg = cfg;
		this.log = log;
	}

	getStatus(): HealthStatus {
		switch (this.state.kind) {
			case 'ready':
				return 'ready';
			case 'codecMismatch':
				return 'codec_mismatch';
			case 'stalled':
			case 'shuttingDown':
			case 'fatal':
				return 'degraded';
			default:
				return 'starting';
		}
	}

	getHealthSnapshot(): HealthSnapshot {
		const now = Date.now();
		this.pruneRestartWindow(now);
		const lastWrite = this.segmentWatcher?.getLastWriteAt() ?? null;
		return {
			status: this.getStatus(),
			rtspConnected: this.state.kind === 'ready',
			codec: this.lastCodec,
			lastSegmentWrittenAgoMs: lastWrite === null ? null : now - lastWrite,
			restartsLast1h: this.restartTimestamps.length,
			uptimeMs: now - this.bootAt
		};
	}

	private pruneRestartWindow(now: number) {
		const cutoff = now - RESTART_WINDOW_MS;
		while (this.restartTimestamps.length > 0 && this.restartTimestamps[0]! < cutoff) {
			this.restartTimestamps.shift();
		}
	}

	async start() {
		await this.spawnChild();
		this.segmentWatcher = new SegmentWatcher(
			this.cfg.HLS_DIR,
			this.log.child({ component: 'segmentWatcher' })
		);
		this.segmentWatcher.start();
		this.startPolling();
	}

	async shutdown() {
		this.intentionalStop = true;
		this.state = { kind: 'shuttingDown' };
		this.stopPolling();
		this.segmentWatcher?.stop();
		if (this.restartTimer) {
			clearTimeout(this.restartTimer);
			this.restartTimer = null;
		}
		await this.killChild();
	}

	private async spawnChild() {
		this.state = { kind: 'spawning' };

		const yamlText = buildMediamtxYaml(this.cfg);
		const yamlPath = join(this.cfg.HLS_DIR, '..', 'mediamtx.yml');
		await mkdir(dirname(yamlPath), { recursive: true });
		await mkdir(this.cfg.HLS_DIR, { recursive: true });
		await writeFile(yamlPath, yamlText, 'utf8');

		const child = spawn(this.cfg.MEDIAMTX_BIN, [yamlPath], {
			stdio: ['ignore', 'pipe', 'pipe'],
			detached: false,
			env: process.env
		});
		this.child = child;
		const childLog = this.log.child({ component: 'mediamtx', pid: child.pid });

		if (child.stdout) {
			createInterface({ input: child.stdout }).on('line', (line) => childLog.info(line));
		}
		if (child.stderr) {
			createInterface({ input: child.stderr }).on('line', (line) => childLog.warn(line));
		}

		child.on('error', (err) => {
			this.log.error({ err }, 'mediamtx spawn error');
		});

		child.on('exit', (code, signal) => {
			this.log.warn({ code, signal }, 'mediamtx exited');
			this.child = null;
			if (this.intentionalStop || this.state.kind === 'shuttingDown') return;
			if (this.state.kind === 'codecMismatch') return;
			this.scheduleRestart();
		});

		this.state = { kind: 'waitingReady' };
	}

	private scheduleRestart() {
		this.restartTimestamps.push(Date.now());
		const delay = this.backoffMs;
		this.state = { kind: 'spawning' };
		this.log.warn({ backoffMs: delay }, 'scheduling mediamtx restart');
		this.restartTimer = setTimeout(() => {
			this.restartTimer = null;
			void this.spawnChild().catch((err) => {
				this.log.error({ err }, 'spawn failed during restart');
			});
		}, delay);
		this.backoffMs = Math.min(BACKOFF_MAX_MS, this.backoffMs * 2);
	}

	private startPolling() {
		this.pollTimer = setInterval(() => void this.pollOnce(), POLL_INTERVAL_MS);
	}

	private stopPolling() {
		if (this.pollTimer) clearInterval(this.pollTimer);
		this.pollTimer = null;
	}

	private async pollOnce() {
		try {
			const info = await getPathInfo(this.cfg.MEDIAMTX_API_PORT, PATH_NAME, POLL_TIMEOUT_MS);
			this.onPoll(info);
		} catch (err) {
			this.log.debug({ err }, 'mediamtx api poll failed');
		}
	}

	private onPoll(info: { ready: boolean; bytesReceived: number; codec: string | null }) {
		if (this.state.kind === 'waitingReady' && info.ready) {
			if (info.codec !== CODEC_EXPECTED) {
				this.log.fatal(
					{ expected: CODEC_EXPECTED, actual: info.codec },
					`FATAL: camera codec is ${info.codec}, expected ${CODEC_EXPECTED}`
				);
				this.lastCodec = info.codec ?? null;
				this.state = { kind: 'codecMismatch', codec: info.codec ?? 'unknown' };
				this.stopPolling();
				void this.killChild();
				return;
			}
			this.lastCodec = info.codec;
			this.state = {
				kind: 'ready',
				readyAt: Date.now(),
				lastBytes: info.bytesReceived,
				zeroDeltaPolls: 0
			};
			this.log.info('mediamtx ready');
			return;
		}

		if (this.state.kind === 'ready') {
			if (
				Date.now() - this.state.readyAt >= CLEAN_UPTIME_MS &&
				this.backoffMs !== BACKOFF_INITIAL_MS
			) {
				this.backoffMs = BACKOFF_INITIAL_MS;
				this.log.info('backoff reset after 60s clean uptime');
			}

			if (!info.ready) {
				this.log.warn('mediamtx source not ready; awaiting reconnect');
				this.state = { kind: 'waitingReady' };
				return;
			}

			const delta = info.bytesReceived - this.state.lastBytes;
			if (delta === 0) {
				this.state.zeroDeltaPolls += 1;
				if (this.state.zeroDeltaPolls >= STALL_THRESHOLD_POLLS) {
					this.log.warn(
						{ thresholdPolls: STALL_THRESHOLD_POLLS, intervalMs: POLL_INTERVAL_MS },
						'stall detected; restarting mediamtx'
					);
					this.state = { kind: 'stalled' };
					// single canonical restart path via child 'exit' handler (see Phase 7 07-RESEARCH Pitfall 4)
					void this.killChild();
					return;
				}
			} else {
				this.state.zeroDeltaPolls = 0;
				this.state.lastBytes = info.bytesReceived;
			}
		}
	}

	private async killChild() {
		const child = this.child;
		if (!child || child.exitCode !== null) return;
		await new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				this.log.warn('SIGTERM grace expired, sending SIGKILL');
				try {
					child.kill('SIGKILL');
				} catch (err) {
					this.log.error({ err }, 'SIGKILL failed');
				}
			}, SIGTERM_GRACE_MS);
			child.once('exit', () => {
				clearTimeout(timer);
				resolve();
			});
			try {
				child.kill('SIGTERM');
			} catch (err) {
				clearTimeout(timer);
				this.log.error({ err }, 'SIGTERM failed');
				resolve();
			}
		});
	}
}
