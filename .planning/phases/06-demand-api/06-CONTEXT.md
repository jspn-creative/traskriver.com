# Phase 06: Demand API - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Worker endpoints that register viewer demand and serve demand state to the relay, with relay status reporting back to KV. Demand is user-initiated (button click), not passive (page load). The relay polls for demand state and reports its own status. KV is the backing store for both demand and relay state.

</domain>

<decisions>
## Implementation Decisions

### Demand registration trigger

- Demand is registered ONLY when the user clicks a "Start stream" button — NOT on page load
- Every page load shows the button (no video player visible by default)
- User clicks button → POST to demand endpoint → KV timestamp written → video player loads immediately (with "Starting stream..." state)
- Button is hidden once stream is live — only video player visible during active streaming
- On page refresh → button appears again, video player is not shown. User must click again to register new demand
- Purpose: prevent automated refresh loops from keeping stream alive indefinitely (cost control)
- Future: page load can trigger demand automatically once Stripe paywall is in place (paid users only)
- Demand endpoint returns minimal response: `{ ok: true }` — no relay status, no estimated wait time
- Demand endpoint is public (no auth required) — auth comes with Stripe/paywall later

### Demand expiry signaling

- Worker calculates expiry from stored KV timestamp (not KV TTL-based expiry)
- KV demand key has NO expirationTtl — key persists until overwritten by next demand click
- Demand window duration is configurable via environment variable (default 5 minutes)
- Response shape should be minimal — `shouldStream` (boolean) is the essential field; `demandTimestamp` useful for relay logging
- Whether `ttlSeconds` is included is at Claude's discretion — the existing shared types were generated without user input and should be revised as needed

### Relay status lifecycle

- Relay reports its current STATE, not transitions — four states visible to web app: `idle`, `starting`, `live`, `stopped`
- `cooldown` is relay-internal only — not reported to KV/web app
- `stopped` (not `stopping`) — the action is fast/complete, name should reflect that
- Relay offline detection: stale timestamp threshold — if relay-status timestamp is >2 min old, consider relay offline
- KV key structure and whether it's a single key or namespaced: Claude's discretion
- Relay status endpoint accepts any state value (no enum validation) — flexible, relay may evolve

### Error resilience

- Demand button click failure handling: Claude's discretion (auto-retry, show error, etc.)
- Relay polling endpoint: 401 Unauthorized for missing/invalid bearer token — don't leak endpoint purpose
- Relay status write endpoint: authenticated via bearer token (same shared secret as demand polling)
- Page load has no KV interaction — page always renders successfully regardless of KV state

### Claude's Discretion

- Error handling UX for demand button failures
- Response shape details beyond `shouldStream` and `demandTimestamp`
- KV key naming and structure for relay status
- Whether to include `ttlSeconds` in demand response
- Shared types in `packages/shared` should be revised to match these decisions — existing types were generated without context

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Demand API requirements

- `.planning/REQUIREMENTS.md` §Demand API — DEMA-01, DEMA-02, DEMA-03 requirement definitions (NOTE: DEMA-01 specifies "page load" trigger but user has overridden this to button-click trigger)
- `.planning/ROADMAP.md` §Phase 06 — Success criteria and phase goal

### Existing code patterns

- `packages/web/src/routes/+page.server.ts` — Current page load function (returns `{}`, will NOT be modified for demand writes)
- `packages/web/src/routes/+page.svelte` — Current page layout with VideoPlayer in `<svelte:boundary>` (must change: button-first, player-after-click)
- `packages/web/src/routes/api/stripe/webhook/+server.ts` — Reference for header-checking auth pattern (similar to bearer token validation)
- `packages/web/wrangler.jsonc` — Wrangler config, needs KV namespace binding added
- `packages/web/src/app.d.ts` — Needs `App.Platform.env` type declaration for KV + RELAY_API_TOKEN
- `packages/shared/index.ts` — Current shared types (generated without user input, MUST be revised to match context decisions)

### Architecture context

- `.planning/PROJECT.md` — Pure polling architecture decision, no client-side heartbeat
- `.planning/STATE.md` §Key Decisions — Bearer token auth, single KV key, read-before-write throttling decisions

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `packages/shared/index.ts`: Has `DemandResponse`, `RelayStatusResponse`, `RelayState`, `RelayConfig` types — BUT these were generated without context and must be revised (e.g., `RelayState` needs `stopped` instead of `stopping`, `cooldown` should be removed from public types)
- `packages/web/src/lib/server/subscription.ts`: HMAC-SHA256 pattern with `crypto.subtle` — reference for any crypto operations
- `packages/web/src/routes/api/stripe/webhook/+server.ts`: Header-checking pattern for auth — structural reference for bearer token validation
- `packages/relay/src/index.ts`: Already wired to read `DEMAND_API_URL` and `RELAY_BEARER_TOKEN` from env

### Established Patterns

- API routes use `export const GET/POST` with SvelteKit's `json()`, `error()` helpers
- Env vars: `$env/dynamic/private` for string values, `platform.env` for bindings (KV, etc.) — `platform.env` has never been used yet, this phase introduces it
- All existing endpoints destructure from `RequestEvent` — none currently use `platform`

### Integration Points

- `packages/web/wrangler.jsonc` — Add `kv_namespaces` array with `RIVER_KV` binding
- `packages/web/src/app.d.ts` — Add `App.Platform` interface with `env.RIVER_KV` (KVNamespace) and `env.RELAY_API_TOKEN` (string)
- `packages/web/src/routes/api/stream/demand/+server.ts` — NEW: GET endpoint for relay polling (bearer auth)
- `packages/web/src/routes/api/stream/demand/+server.ts` — NEW: POST endpoint for demand registration (public, called by button)
- `packages/web/src/routes/api/relay/status/+server.ts` — NEW: POST endpoint for relay state reporting (bearer auth)
- `packages/web/src/routes/+page.svelte` — MODIFIED: button-first UX, player loads after demand registration
- `packages/shared/index.ts` — MODIFIED: revise types to match context decisions

</code_context>

<specifics>
## Specific Ideas

- Button-gated stream is a deliberate cost-control measure — not a UX compromise. Every page load shows the button, never the player, to prevent automated refreshes from incurring streaming fees.
- The "start stream" button is the paywall's future integration point — once Stripe is configured, page load can auto-trigger demand for paid users, removing the button entirely.
- States should be thought of as current state descriptions, not transitions. "stopped" not "stopping."

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 06-demand-api_
_Context gathered: 2026-03-20_
