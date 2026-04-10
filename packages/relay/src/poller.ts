import type { DemandResponse } from "@traskriver/shared";
import { log } from "./logger";

export interface PollResult {
  success: boolean;
  shouldStream: boolean;
  ttlSeconds: number;
  consecutiveFailures: number;
}

export class DemandPoller {
  private consecutiveFailures = 0;

  constructor(private config: { demandApiUrl: string; bearerToken: string; requestTimeoutMs: number }) {}

  async poll() {
    try {
      const response = await fetch(this.config.demandApiUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config.bearerToken}`,
        },
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as DemandResponse;
      this.consecutiveFailures = 0;
      log.info(`poll: shouldStream=${body.shouldStream}, ttl=${body.ttlSeconds}s`);
      return {
        success: true,
        shouldStream: body.shouldStream,
        ttlSeconds: body.ttlSeconds,
        consecutiveFailures: this.consecutiveFailures,
      } satisfies PollResult;
    } catch (error) {
      this.consecutiveFailures += 1;
      const reason = error instanceof Error ? error.message : String(error);
      log.error(`poll failed: ${reason} (failures: ${this.consecutiveFailures})`);
      return {
        success: false,
        shouldStream: false,
        ttlSeconds: 0,
        consecutiveFailures: this.consecutiveFailures,
      } satisfies PollResult;
    }
  }

  resetFailures() {
    this.consecutiveFailures = 0;
  }

  getConsecutiveFailures() {
    return this.consecutiveFailures;
  }
}
