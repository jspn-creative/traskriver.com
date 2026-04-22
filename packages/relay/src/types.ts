// Demand API response — returned by GET /api/stream/demand
export interface DemandResponse {
	shouldStream: boolean;
	demandTimestamp: number | null;
	ttlSeconds: number;
}

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
