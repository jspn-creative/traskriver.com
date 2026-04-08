# Phase 08: Stream UX - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Demand-aware UI states for the web app: viewers see accurate, actionable stream status — they know when the stream is starting, live, ended, or unavailable, and can restart it. This phase connects the existing button-gated demand flow (Phase 06) and relay status reporting (Phase 07) to the frontend UI.

</domain>

<decisions>
## Implementation Decisions

### Relay status fetching
- **D-01:** Add a new public GET `/api/relay/status` endpoint that reads the `relay-status` KV key and returns the state + timestamp — separate from the relay-authenticated demand endpoint
- **D-02:** After user clicks "Start stream" and demand is registered, page polls GET `/api/relay/status` every 3 seconds to track relay state transitions
- **D-03:** Polling stops when VideoPlayer fires `onPlaying` (stream confirmed live). Polling resumes only if the stream errors out

### State transitions & UI mapping
- **D-04:** Replace hardcoded `setTimeout` phase transitions with relay-driven state machine — page phase is determined by relay-status polling results, not fake timers
- **D-05:** Rename page phase states from `'sales'/'connecting'/'connected'/'telemetry'` to stream-meaningful names (e.g., `'idle'/'starting'/'live'/'viewing'`) — agent picks exact names that make the code self-documenting and aligned with relay states
- **D-06:** If relay reports `starting` for more than 60 seconds, show a timeout/error state — don't leave users waiting indefinitely

### Stream ended experience
- **D-07:** Stream end detection uses HLS error + relay-status confirmation: when VideoPlayer fires `onError` (fatal HLS error), resume relay-status polling to confirm relay is `stopped`/`idle` before showing "Stream ended" — avoids false positives from transient HLS hiccups
- **D-08:** "Stream ended — click to restart" prompt appears in the video area (centered over poster image), not in the sidebar/panel — keeps the prompt where the user's attention already is
- **D-09:** Clicking restart performs a full reset — fires new demand POST, page returns to "starting" state with relay-status polling. Same flow as initial start, clean and predictable

### Unavailable vs Starting distinction
- **D-10:** "Starting stream..." state uses optimistic pulse animation with "Starting stream..." text — patient, encouraging tone
- **D-11:** "Stream unavailable" (relay offline — stale status timestamp >2 min) uses static, muted message like "Stream is currently offline" — informational, not alarming. No red/error colors. This is a nature camera, not a 911 system
- **D-12:** When stream is unavailable, the "Start stream" button remains enabled but with reduced expectations — label changes to "Try starting stream" or similar. Registers demand in case relay comes back. Polling will show it's still unavailable if relay is truly down
- **D-13:** No relay status pre-fetch on page load — page always starts in neutral "Start stream" state. Relay status is only fetched after user clicks

### Agent's Discretion
- Exact page phase state names (aligned with relay states, self-documenting)
- Loading skeleton/animation design during "starting" state
- Exact "Stream ended" and "Stream unavailable" copy and layout
- Error state handling for edge cases (e.g., demand POST succeeds but polling fails)
- Whether the header status badge (Live/Standby/Error) updates from relay status or VideoPlayer state
- Transition animations between states

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stream UX requirements
- `.planning/REQUIREMENTS.md` §Stream UX — STRX-01, STRX-02, STRX-03 requirement definitions
- `.planning/ROADMAP.md` §Phase 08 — Success criteria and phase goal

### Prior phase decisions
- `.planning/phases/06-demand-api/06-CONTEXT.md` — Button-gated demand, relay states visible to web (`idle`/`starting`/`live`/`stopped`), stale timestamp = offline (>2 min), `cooldown` is relay-internal, demand endpoint is public

### Architecture context
- `.planning/PROJECT.md` — Relay polling architecture, known issues (viewer count fluctuation, Safari HLS buffer stall errors)
- `.planning/STATE.md` §Key Decisions — Button-gated stream loading, relay status KV TTL 120s as heartbeat

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/web/src/lib/components/VideoPlayer.svelte`: Vidstack-based HLS player with `onPlaying` and `onError` callbacks, fatal vs non-fatal error handling, fullscreen support. Already handles `manifestParsingError` (stream offline) gracefully
- `packages/web/src/lib/components/PassDetailsPanel.svelte`: "Start stream" button with loading/error/connected states, demand registration call. Needs state machine updates
- `packages/web/src/routes/api/relay/status/+server.ts`: POST endpoint for relay writing status — needs a GET handler added for web app reads
- `packages/web/src/routes/api/stream/demand/+server.ts`: POST (public, demand registration) + GET (relay-authenticated, demand state). Working as-is
- `packages/shared/index.ts`: `RelayState` (`idle`/`starting`/`live`/`stopped`), `RelayStatusPayload`, `DemandResponse` types — available for web app relay status typing

### Established Patterns
- API routes use `export const GET/POST` with SvelteKit's `json()`, `error()` helpers
- `platform?.env?.RIVER_KV` for KV reads — established in demand and relay-status endpoints
- `<svelte:boundary>` with `{@const stream = await getStreamInfo()}` for async stream loading (only when `demandRegistered` is true)
- Bearer token auth pattern for relay-only endpoints; public access for user-facing endpoints

### Integration Points
- `packages/web/src/routes/api/relay/status/+server.ts` — Add GET handler (public, reads KV)
- `packages/web/src/routes/+page.svelte` — Replace setTimeout-based phase transitions with relay-status polling, rename phase states, add stream-ended and unavailable UI states
- `packages/web/src/lib/components/PassDetailsPanel.svelte` — Update button states for new phase names, add "Try starting stream" variant for unavailable state
- `packages/web/src/routes/stream.remote.ts` — Existing `getStreamInfo()` used in `<svelte:boundary>` — still needed for signed HLS URL generation

</code_context>

<specifics>
## Specific Ideas

- Stream states should feel calm and informational — nature camera vibes, not urgency. "Starting stream..." with a pulse, "Stream is currently offline" as a quiet statement
- The "Stream ended" prompt goes in the video area overlay, not the sidebar — attention stays where the video was
- Button always works, even when relay is offline — optimistic approach, let the system sort it out

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-stream-ux*
*Context gathered: 2026-04-08*
