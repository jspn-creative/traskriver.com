import type { RelayConfig, RelayInternalState } from '@river-stream/shared';

// TODO: Load from .env in Phase 09
const config: RelayConfig = {
	streamUrl: process.env.STREAM_URL ?? '',
	rtspUrl: process.env.RTSP_URL ?? '',
	demandApiUrl: process.env.DEMAND_API_URL ?? 'http://localhost:5173/api/stream/demand',
	statusApiUrl: process.env.STATUS_API_URL ?? 'http://localhost:5173/api/relay/status',
	bearerToken: process.env.RELAY_BEARER_TOKEN ?? '',
	pollIntervalMs: 10000,
	requestTimeoutMs: 8000,
	failureThreshold: 30
};

let ffmpegProcess: ReturnType<typeof Bun.spawn> | null = null;
let consecutiveFailures = 0;
let currentState: RelayInternalState = 'idle';

async function pollDemand(): Promise<void> {
	// TODO: Implement in Phase 07
	console.log('[relay] polling demand...');
}

async function startFfmpeg(): Promise<void> {
	// TODO: Implement in Phase 07
	console.log('[relay] starting ffmpeg...');
}

async function stopFfmpeg(): Promise<void> {
	// TODO: Implement in Phase 07
	console.log('[relay] stopping ffmpeg...');
}

async function run(): Promise<void> {
	console.log('[relay] starting...');
	void ffmpegProcess;
	void consecutiveFailures;
	void currentState;
	void startFfmpeg;
	void stopFfmpeg;
	while (true) {
		await pollDemand();
		await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
	}
}

run().catch(console.error);
