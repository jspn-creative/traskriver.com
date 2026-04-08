---
phase: 8
reviewers: [gemini]
reviewed_at: 2026-04-08T15:11:24Z
plans_reviewed: [08-01-PLAN.md, 08-02-PLAN.md]
---

# Cross-AI Plan Review — Phase 8: Stream UX

## Gemini Review

### Summary
The plans successfully bridge the gap between the backend relay service and the frontend user experience. Plan 01 introduces a lightweight, public API for status polling that respects the existing security model, while Plan 02 replaces hardcoded timers with a reactive state machine (using Svelte 5 runes) that handles real-world network and stream conditions, including "stale" relay states and graceful recovery from HLS failures.

### Strengths
- **Robust State Machine**: The move from `setTimeout` chains to a state machine driven by real data (`starting` → `live` → `viewing`) significantly improves reliability and transparency.
- **"Ended Confirming" Logic**: The introduction of an intermediate state (`ended_confirming`) after an HLS error is a sophisticated way to filter out transient network glitches before showing a fatal "Stream Ended" message.
- **Efficient Polling**: Using `setTimeout` chaining instead of `setInterval` prevents poll overlapping if requests take longer than the interval, and stopping the poll once the stream is `viewing` saves client/server resources.
- **UX Nuance**: The distinction between "Starting" (active pulse) and "Unavailable" (static/muted) correctly manages user expectations when the relay service is offline.
- **Clean Shared Types**: Standardizing `RelayStatusResponse` in the shared package ensures type safety across the monorepo.

### Concerns
- **[LOW] State Naming Discrepancy**: `RelayState` in Plan 01 uses `stopped`, but the frontend `phase` in Plan 02 uses `ended`. While the mapping is handled in `pollRelayStatus`, using consistent terminology (e.g., `ended` for both) would reduce cognitive load.
- **[MEDIUM] Stale Priority**: In `pollRelayStatus`, if `data.stale` is true, the phase is set to `unavailable` and the function returns. If the relay is actually `stopped` (but the timestamp is slightly old), the user might see "Unavailable" instead of "Stream Ended." The stale threshold (120s) should ideally be slightly higher than the relay's reporting frequency to avoid flickering.
- **[LOW] Starting Timestamp Reset**: If a user refreshes the page while a stream is `starting`, the `startingTimestamp` is lost because there is no pre-fetch (D-13). This means the 60s timeout resets on every refresh. This is acceptable given the "no pre-fetch" constraint but worth noting.

### Suggestions
- **Unify Constants**: Ensure `STALE_THRESHOLD_MS` in the API and `STATUS_TTL_SECONDS` in KV usage are imported from a single source of truth (likely `packages/shared`).
- **Handle 404/Empty KV**: The GET handler returns `stale: true` when no key exists. This is correct, but the frontend should ensure this doesn't trigger an error UI before the user even clicks "Start." (Plan 02 currently addresses this by only polling after demand).
- **Relay Status Refinement**: Consider adding an `isLive` helper in the shared package that checks `state === 'live' && !stale` to centralize the "health" logic.

### Risk Assessment: LOW
The plans are surgical and low-risk. They rely on existing infrastructure (KV, Shared Package) and follow established patterns in the monorepo. The use of Svelte 5 runes is consistent with the existing `+page.svelte` structure.

**Justification**: The logic is self-contained within the status polling loop and does not interfere with the critical demand registration or signed URL generation paths. Security is maintained by keeping the POST endpoint protected while exposing only non-sensitive operational data via GET.

---

## Consensus Summary

*Single reviewer — no cross-reviewer consensus comparison applicable. Key findings from the Gemini review are elevated below.*

### Agreed Strengths
- State machine approach replacing `setTimeout`-based fake transitions is the right architectural choice
- `ended_confirming` intermediate state avoids false "Stream Ended" messages from transient HLS hiccups
- Efficient `setTimeout`-chaining polling prevents request overlap, stops on `viewing`, resumes only on error
- Unavailable vs Starting distinction provides correct UX differentiation
- Shared `RelayStatusResponse` type ensures type-safe contract across monorepo

### Agreed Concerns

1. **[MEDIUM] Stale state vs actual `stopped` state race**: When the relay intentionally stops streaming, it writes `state: 'stopped'` to KV with a 120s TTL. Once the key expires, GET returns `state: null, stale: true`. If `pollRelayStatus` sees `stale: true` before seeing `stopped`, the user gets "Unavailable" instead of "Stream Ended." The executor should consider checking the last known relay state before transitioning to `unavailable` — if polling previously saw `stopped`, the transition should go to `ended` not `unavailable`.

2. **[LOW] Constants not unified**: `STALE_THRESHOLD_MS` is derived from `STATUS_TTL_SECONDS` in the API endpoint, while `STARTING_TIMEOUT_MS` and `POLL_INTERVAL_MS` are hardcoded in the page. Both could be exported from `packages/shared` for a single source of truth.

3. **[LOW] Starting timeout doesn't pause during unavailable**: The 60s timeout clock starts at demand registration. If the relay goes `unavailable` for 30s then comes back, only 30s remains before timeout. The timer could be paused while in `unavailable` state, but this is a minor edge case.

### Divergent Views

*N/A — single reviewer.*
