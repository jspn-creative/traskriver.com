import type { RelayStatusPayload } from './types.ts';
import { log } from './logger';

export class StatusReporter {
	constructor(
		private config: {
			statusApiUrl: string;
			bearerToken: string;
			requestTimeoutMs: number;
		}
	) {}

	async report(state: string) {
		try {
			const payload = {
				state,
				timestamp: Date.now()
			} satisfies RelayStatusPayload;
			const response = await fetch(this.config.statusApiUrl, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${this.config.bearerToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(payload),
				signal: AbortSignal.timeout(this.config.requestTimeoutMs)
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			log.info(`status reported: ${state}`);
			return true;
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			log.warn(`status report failed: ${reason}`);
			return false;
		}
	}
}
