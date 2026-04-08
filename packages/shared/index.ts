// Demand API response shape
export interface DemandResponse {
	shouldStream: boolean;
	demandTimestamp: number | null;
	ttlSeconds: number;
}

// Relay status values
export type RelayState = 'idle' | 'starting' | 'live' | 'stopping' | 'cooldown';

// Relay status response shape (written by relay to KV)
export interface RelayStatusResponse {
	state: RelayState;
	timestamp: number;
	version: string;
}

// Configuration shape for relay
export interface RelayConfig {
	streamUrl: string;
	rtspUrl: string;
	demandApiUrl: string;
	bearerToken: string;
	pollIntervalMs: number;
	requestTimeoutMs: number;
	failureThreshold: number;
}
