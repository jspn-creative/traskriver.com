import { RelayConfig } from '@river-stream/shared';
import { DemandPoller } from './poller';
import { FfmpegManager } from './ffmpeg';
import { startHealthServer } from './health-server';
import { log } from './logger';
import { RelayStateMachine } from './state-machine';
import { StatusReporter } from './status-reporter';

const config: RelayConfig = {
	streamUrl: process.env.STREAM_URL ?? '',
	rtspUrl: process.env.RTSP_URL ?? '',
	demandApiUrl: process.env.DEMAND_API_URL ?? 'http://localhost:5173/api/stream/demand',
	statusApiUrl: process.env.STATUS_API_URL ?? 'http://localhost:5173/api/relay/status',
	bearerToken: process.env.RELAY_BEARER_TOKEN ?? '',
	pollIntervalMs: Number(process.env.POLL_INTERVAL_MS) || 10_000,
	requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS) || 8_000,
	failureThreshold: Number(process.env.FAILURE_THRESHOLD) || 30
};

const liveConfirmMs = Number(process.env.LIVE_CONFIRM_MS) || 4_000;
const healthPort = Number(process.env.RELAY_HEALTH_PORT ?? '9090');
const healthHostname = process.env.RELAY_HEALTH_HOSTNAME ?? '0.0.0.0';

const COOLDOWN_MS = 15_000;

if (!config.streamUrl) {
	log.error('STREAM_URL is required');
	process.exit(1);
}
if (!config.rtspUrl) {
	log.error('RTSP_URL is required');
	process.exit(1);
}
if (!config.bearerToken) {
	log.error('RELAY_BEARER_TOKEN is required');
	process.exit(1);
}

const ffmpegPath = Bun.which('ffmpeg');
if (!ffmpegPath) {
	log.error('ffmpeg not found in PATH');
	process.exit(1);
}
log.info(`ffmpeg binary: ${ffmpegPath}`);

try {
	const ver = Bun.spawnSync(['ffmpeg', '-version'], { stdout: 'pipe' });
	if (ver.success && ver.stdout) {
		const firstLine = new TextDecoder().decode(ver.stdout).split('\n')[0];
		log.info(`ffmpeg version: ${firstLine}`);
	}
} catch {
	// non-fatal after PATH check
}

const sm = new RelayStateMachine();
const poller = new DemandPoller(config);
const ffmpeg = new FfmpegManager(config);
const reporter = new StatusReporter(config);

sm.onTransition(async (event) => {
	const publicState =
		event.to === 'stopping' || event.to === 'cooldown' ? 'idle' : event.to;
	await reporter.report(publicState);
});

ffmpeg.onExit((code, signal) => {
	const state = sm.getState();
	if (state === 'stopping') {
		return;
	}
	if (state === 'starting') {
		log.error(`ffmpeg exited during start (exit: ${code}, signal: ${signal})`);
		sm.transition('cooldown', 'ffmpeg crash during start');
	} else if (state === 'live') {
		log.error(`ffmpeg crashed (exit: ${code}, signal: ${signal}) during live`);
		sm.transition('stopping', 'ffmpeg crash');
		sm.transition('cooldown', 'cooldown after live crash');
	}
});

let health: ReturnType<typeof startHealthServer> = null;

async function tick() {
	const state = sm.getState();

	if (state === 'cooldown') {
		log.info(`cooldown: waiting ${COOLDOWN_MS / 1000}s before retry`);
		await new Promise((r) => setTimeout(r, COOLDOWN_MS));
		sm.transition('idle', 'cooldown elapsed');
		scheduleTick();
		return;
	}

	const result = await poller.poll();

	if (result.consecutiveFailures >= config.failureThreshold) {
		if (state === 'live' || state === 'starting') {
			log.warn(`safety stop: ${result.consecutiveFailures} consecutive poll failures`);
			sm.transition('stopping', `${result.consecutiveFailures} consecutive poll failures`);
			await ffmpeg.stop();
			sm.transition('idle', 'safety stop complete');
			poller.resetFailures();
		}
		scheduleTick();
		return;
	}

	if (state === 'idle' && result.shouldStream) {
		sm.transition('starting', 'demand detected');
		const started = await ffmpeg.start();
		if (!started) {
			sm.transition('cooldown', 'ffmpeg failed to start');
		} else {
			const deadline = Date.now() + liveConfirmMs;
			let diedEarly = false;
			while (Date.now() < deadline) {
				if (!ffmpeg.isRunning()) {
					diedEarly = true;
					break;
				}
				await new Promise((r) => setTimeout(r, 200));
			}
			if (diedEarly || !ffmpeg.isRunning()) {
				sm.transition('cooldown', 'ffmpeg died during live confirm');
			} else {
				sm.transition('live', 'ffmpeg stable after live confirm');
			}
		}
	} else if ((state === 'live' || state === 'starting') && !result.shouldStream) {
		sm.transition('stopping', 'demand expired');
		await ffmpeg.stop();
		sm.transition('idle', 'clean stop complete');
	}

	scheduleTick();
}

function scheduleTick() {
	setTimeout(tick, config.pollIntervalMs);
}

async function run() {
	log.info('relay starting');
	log.info(
		`config: poll=${config.pollIntervalMs}ms, timeout=${config.requestTimeoutMs}ms, failureThreshold=${config.failureThreshold}, liveConfirmMs=${liveConfirmMs}`
	);

	health = startHealthServer({
		port: healthPort,
		hostname: healthHostname,
		getSnapshot: () => ({
			state: sm.getState(),
			ts: Date.now()
		})
	});
	if (health) {
		log.info(
			`health: http://${healthHostname === '0.0.0.0' ? '<host>' : healthHostname}:${healthPort}/health (use Tailscale MagicDNS hostname when remote)`
		);
	}

	await reporter.report('idle');

	void tick().catch((err) => {
		log.error(`tick fatal: ${err}`);
	});
}

process.on('SIGTERM', async () => {
	log.info('SIGTERM received, shutting down');
	health?.stop();
	if (ffmpeg.isRunning()) {
		await ffmpeg.stop();
	}
	await reporter.report('stopped');
	process.exit(0);
});

process.on('SIGINT', async () => {
	log.info('SIGINT received, shutting down');
	health?.stop();
	if (ffmpeg.isRunning()) {
		await ffmpeg.stop();
	}
	await reporter.report('stopped');
	process.exit(0);
});

run().catch((err) => {
	log.error(`fatal: ${err}`);
	process.exit(1);
});
