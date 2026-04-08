// Demand API response — returned by GET /api/stream/demand
export interface DemandResponse {
	shouldStream: boolean;
	demandTimestamp: number | null;
	ttlSeconds: number;
}

/** Public relay states visible to web app (stored in KV) */
export type RelayState = 'idle' | 'starting' | 'live' | 'stopped';

/** Internal relay states (includes transitions not exposed to web) */
export type RelayInternalState = 'idle' | 'starting' | 'live' | 'stopping' | 'cooldown';

/** Relay status payload — POSTed by relay to Worker */
export interface RelayStatusPayload {
	state: string;
	timestamp: number;
}

/** Response from GET /api/relay/status — consumed by web app for UI state */
export interface RelayStatusResponse {
	state: RelayState | null;
	timestamp: number | null;
	stale: boolean;
}

export const RELAY_STATUS_TTL_SECONDS = 120;
export const RELAY_STATUS_STALE_THRESHOLD_MS = RELAY_STATUS_TTL_SECONDS * 1000;

/** Configuration shape for relay service */
export interface RelayConfig {
	streamUrl: string;
	rtspUrl: string;
	demandApiUrl: string;
	statusApiUrl: string;
	bearerToken: string;
	pollIntervalMs: number;
	requestTimeoutMs: number;
	failureThreshold: number;
}
