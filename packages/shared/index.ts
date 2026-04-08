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
