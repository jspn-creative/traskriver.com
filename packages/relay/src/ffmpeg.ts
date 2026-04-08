import { log } from './logger';

const STDERR_LINE_CAP = 30;
const STDERR_CHAR_CAP = 4096;
const SIGKILL_MS = 10_000;

type ExitCallback = (code: number | null, signal: string | null) => void;

export class FfmpegManager {
	private process: ReturnType<typeof Bun.spawn> | null = null;
	private exitCallbacks: ExitCallback[] = [];
	private stderrLines: string[] = [];
	private stderrTask: Promise<void> | null = null;
	private killFallbackTimer: ReturnType<typeof setTimeout> | null = null;
	private intentionalStop = false;

	constructor(private config: { rtspUrl: string; streamUrl: string }) {}

	onExit(callback: ExitCallback) {
		this.exitCallbacks.push(callback);
	}

	private clearKillTimer() {
		if (this.killFallbackTimer) {
			clearTimeout(this.killFallbackTimer);
			this.killFallbackTimer = null;
		}
	}

	private pushStderrLine(line: string) {
		if (process.env.RELAY_FFMPEG_VERBOSE === '1') {
			log.debug(`ffmpeg stderr: ${line}`);
		}
		this.stderrLines.push(line);
		if (this.stderrLines.length > STDERR_LINE_CAP) {
			this.stderrLines.splice(0, this.stderrLines.length - STDERR_LINE_CAP);
		}
	}

	private getStderrTail() {
		const joined = this.stderrLines.join('\n');
		if (joined.length > STDERR_CHAR_CAP) {
			return joined.slice(-STDERR_CHAR_CAP);
		}
		return joined;
	}

	private fireExitCallbacks(code: number | null, signal: string | null) {
		for (const cb of this.exitCallbacks) {
			try {
				cb(code, signal);
			} catch {
				// non-fatal
			}
		}
	}

	private startStderrConsumer(stderr: ReadableStream<Uint8Array>) {
		const decoder = new TextDecoder();
		let carry = '';
		this.stderrTask = (async () => {
			const reader = stderr.getReader();
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					carry += decoder.decode(value, { stream: true });
					const parts = carry.split('\n');
					carry = parts.pop() ?? '';
					for (const line of parts) {
						this.pushStderrLine(line);
					}
				}
				if (carry) {
					this.pushStderrLine(carry);
				}
			} catch {
				// ignore teardown races
			}
		})();
	}

	private attachExitHandler(subprocess: NonNullable<FfmpegManager['process']>) {
		void subprocess.exited.then(async () => {
			await this.stderrTask?.catch(() => {});
			const exitCode = subprocess.exitCode;
			const signalStr = subprocess.signalCode ? String(subprocess.signalCode) : null;
			this.fireExitCallbacks(exitCode, signalStr);
			if (
				!this.intentionalStop &&
				exitCode !== null &&
				exitCode !== 0
			) {
				const stderrTail = this.getStderrTail();
				log.error(`ffmpeg failed (exit ${exitCode}) stderr tail:\n${stderrTail}`);
			}
			if (this.process === subprocess) {
				this.process = null;
			}
		});
	}

	async start() {
		if (this.process) {
			if (this.isRunning()) {
				log.warn('ffmpeg: start called while already running');
				return false;
			}
			this.process = null;
		}

		this.stderrLines = [];
		this.stderrTask = null;

		try {
			const subprocess = Bun.spawn(
				[
					'ffmpeg',
					'-rtsp_transport',
					'tcp',
					'-i',
					this.config.rtspUrl,
					'-c:v',
					'copy',
					'-c:a',
					'aac',
					'-f',
					'flv',
					this.config.streamUrl
				],
				{
					stdout: 'ignore',
					stderr: 'pipe'
				}
			);

			this.process = subprocess;
			const stderr = subprocess.stderr;
			if (stderr && stderr instanceof ReadableStream) {
				this.startStderrConsumer(stderr);
			}

			this.attachExitHandler(subprocess);
			log.info(`ffmpeg started (pid: ${subprocess.pid})`);
			return true;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			const stderrTail = this.getStderrTail();
			log.error(`ffmpeg spawn failed: ${msg} stderr tail:\n${stderrTail}`);
			this.process = null;
			return false;
		}
	}

	async stop() {
		const proc = this.process;
		if (!proc) {
			return;
		}

		if (!this.isRunning()) {
			await proc.exited.catch(() => {});
			this.clearKillTimer();
			if (this.process === proc) {
				this.process = null;
			}
			return;
		}

		this.intentionalStop = true;
		const pid = proc.pid;
		proc.kill('SIGTERM');
		log.info(`ffmpeg SIGTERM sent (pid: ${pid})`);

		this.clearKillTimer();
		this.killFallbackTimer = setTimeout(() => {
			if (this.process === proc && this.isRunning()) {
				proc.kill('SIGKILL');
				log.warn(`ffmpeg SIGKILL sent (pid: ${pid}) — SIGTERM timeout`);
			}
		}, SIGKILL_MS);

		await proc.exited;
		this.clearKillTimer();
		await this.stderrTask?.catch(() => {});
		if (this.process === proc) {
			this.process = null;
		}
		this.intentionalStop = false;
		const code = proc.exitCode;
		log.info(`ffmpeg stopped (exit: ${code})`);
	}

	isRunning() {
		return this.process !== null && this.process.exitCode === null;
	}
}
