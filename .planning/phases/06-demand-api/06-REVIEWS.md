---
phase: 6
reviewers: [gemini]
reviewed_at: 2026-04-07T00:00:00Z
plans_reviewed: [06-01-PLAN.md, 06-02-PLAN.md, 06-03-PLAN.md]
---

# Cross-AI Plan Review — Phase 6: Demand API

> **Reviewers**: Gemini CLI
> **Skipped**: Claude (current runtime — excluded for independence), Codex (not installed)

---

## Gemini Review

This review evaluates the implementation plans for **Phase 6: Demand API**. The plans successfully pivot from the original "page-load" trigger to the user-requested "button-click" model, prioritizing cost control and operational simplicity.

### 1. Summary

The plans provide a solid blueprint for a "lazy-loading" stream architecture. By separating demand registration (public POST) from demand polling (authenticated GET), the system minimizes attack surfaces while ensuring the relay only operates when a human is actively engaged. The use of Cloudflare KV for state persistence is appropriate for the scale, and the decision to calculate demand expiry programmatically rather than relying on KV TTL provides the necessary precision for the "5-minute window" requirement.

### 2. Strengths

- **Cost-Conscious Design**: Moving the demand trigger to a button click and gating the heavy `getStreamInfo()` call (which involves JWT generation) behind that click effectively prevents wasted resources from bots or idle tabs.
- **Throttling Logic**: The 30s read-before-write throttle in Plan 02 is a simple but effective way to prevent KV write-volume spikes without complex infrastructure.
- **Clean Type Separation**: Plan 01 correctly distinguishes between the internal states the relay manages (`stopping`, `cooldown`) and the simplified states reported to the web app (`idle`, `live`), keeping the API surface area manageable.
- **Svelte 5 Idioms**: Plan 03 leverages `svelte:boundary` and snippets, which is the correct approach for handling the transition from "idle" to "loading/playing" in the new Svelte 5 syntax.

### 3. Concerns

- **[MEDIUM] Environment Variable Configuration**: Plan 01 mentions adding `RELAY_API_TOKEN` to the TypeScript interface but doesn't explicitly detail adding it to `wrangler.jsonc` or as a Cloudflare Secret. Since this token is the sole security barrier for the relay endpoints, its lifecycle management is critical.
- **[LOW] KV Consistency**: Cloudflare KV is eventually consistent. A "read-before-write" throttle in a high-concurrency scenario might occasionally allow two writes within the same millisecond. Given the 30s window and "cost control" context, this is a negligible risk (won't fix).
- **[LOW] Relay Offline Detection in UI**: DEMA-03 mentions relay offline detection (stale timestamp > 2 min). While the Worker endpoint stores the timestamp, the logic for the web UI to display an "Offline" state if the relay is stale isn't explicitly detailed in Plan 03's template.
- **[LOW] Relay Token Setup on Relay Side**: Plan 02 mentions Bearer auth for the GET endpoint but doesn't specify how the relay receives its `RELAY_API_TOKEN`. It's implied in `RelayConfig`, but the setup of these secrets on the relay side is omitted.

### 4. Suggestions

- **Explicit Secret Setup**: In Plan 01, include a reminder to run `wrangler secret put RELAY_API_TOKEN` to ensure the environment is actually ready for the code in Plan 02.
- **Demand Window Variable**: In Plan 02, the 5-minute window is hardcoded (`5 * 60 * 1000`). This should be read from `platform.env.DEMAND_WINDOW_SECONDS` (with a default) to match the "configurable via env var" user decision.
- **Cleanup Internal States**: In Plan 01, ensure that when the relay reports its status, it maps `stopping` or `cooldown` to `stopped` or `idle` before sending the payload, as the `RelayStatusPayload` now expects a generic string or the simplified 4-state set.
- **UI Feedback**: In Plan 03, if the `POST /api/stream/demand` fails, ensure the `PassDetailsPanel` can display a specific error message so the user knows if the "Service is unavailable" vs. just "loading."

### 5. Risk Assessment: LOW

The plans are well-aligned with the specific technical constraints of Cloudflare Workers and the user's explicit cost-saving overrides. The logic is surgical and avoids over-engineering. The primary risks are configuration-based (secrets/env vars) rather than architectural.

**Justification**: The transition to a button-first UX is the most significant change, and Plan 03 handles it correctly by isolating the stream logic behind a local state variable, ensuring no KV or Stream API interaction occurs until intended.

---

## Consensus Summary

> Single reviewer (Gemini). Consensus analysis based on Gemini's findings plus cross-referencing against plan requirements.

### Key Strengths Identified

- **Cost-first architecture**: Button-gated demand + JWT generation deferred until click is well-conceived; prevents idle tab or bot drain.
- **Type system design**: `RelayState` vs `RelayInternalState` split cleanly separates what the web app needs to know from what the relay manages internally. Good API hygiene.
- **Timestamp-based expiry over KV TTL**: Correct call. KV TTL would not give the relay precise `ttlSeconds` remaining; computing it from the stored timestamp is more flexible and accurate.
- **30s read-before-write throttle**: Simple defense against rapid button-clicks causing KV write storms.
- **Svelte 5 boundary gating**: `{#if demandRegistered}` around `<svelte:boundary>` correctly defers the async `getStreamInfo()` call.

### Agreed Concerns

1. **[MEDIUM] `RELAY_API_TOKEN` secret lifecycle not covered** — Plan 01 types the binding but neither plan explicitly calls out `wrangler secret put RELAY_API_TOKEN`. The relay endpoints are completely open without this secret being set in Cloudflare's environment. Executor must not overlook this.

2. **[LOW] Demand window hardcoded in Plan 02** — CONTEXT.md says "configurable via environment variable" but the plan code shows `5 * 60 * 1000` as a literal constant. Should read from `platform.env.DEMAND_WINDOW_SECONDS` with a safe default.

3. **[LOW] Relay-side secret not addressed** — `RELAY_API_TOKEN` needs to land in the relay's environment too (`.env` file or system env on the relay device). Plan 02 depends on the relay calling the GET/POST endpoints with this token but no plan covers distributing it.

4. **[LOW] Relay offline UI state deferred but not explicitly noted** — Plans don't mention displaying "Relay offline" in the web UI when the relay-status timestamp is stale. This is intentionally deferred (Phase 08 likely), but a DEFERRED note in Plan 03 would help future planners.

### Requirements Alignment Check

| Requirement                                               | Plan Addresses It?                                                                                     | Notes                                                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| DEMA-01 (page-load demand, KV write with TTL)             | **Partially** — user override changed trigger to button-click; no `expirationTtl` on KV key as decided | Requirements.md is now stale vs. CONTEXT.md decisions. Not a plan defect, but REQUIREMENTS.md should be updated post-execution. |
| DEMA-02 (GET endpoint, bearer auth, DemandResponse shape) | **Yes** — Plan 02 implements fully                                                                     |                                                                                                                                 |
| DEMA-03 (relay-status KV write, state + timestamp)        | **Yes** — Plan 02 implements; Plan 01 types it                                                         | Original DEMA-03 lists `stopping` as a valid state; CONTEXT.md overrides this to `stopped`. Correct to follow CONTEXT.md.       |

### Divergent Views

None (single reviewer). The main open question not fully addressed by any reviewer:

- **Is the `{ ok: true }` demand POST response sufficient for the UI to handle partial failures?** — If the KV write fails silently (e.g., KV quota exceeded), the endpoint still returns `{ ok: true }` and the relay never gets a demand signal. The button would appear to succeed but the stream would never start. Mitigating this would require either bubbling the KV error (return 5xx) or accepting the current "best-effort" behavior.

---

_Phase: 06-demand-api_
_Reviews generated: 2026-04-07_
_To incorporate feedback: `/gsd-plan-phase 6 --reviews`_
