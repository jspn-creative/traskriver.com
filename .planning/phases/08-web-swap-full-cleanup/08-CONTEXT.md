# Phase 8: Web Swap + Full Cleanup - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Point the web client at the self-hosted HLS URL from `packages/stream` (already deployed on VPS), collapse the page state machine from 8 states to 4, and delete every trace of the relay/demand/JWT/Cloudflare Stream pipeline in the same branch that ships v1.2.

Out of scope: infra hardening (systemd, TLS, OLS reverse proxy, camera DDNS/CVE) — deferred to v1.3. Stream service is already running on the VPS.

</domain>

<decisions>
## Implementation Decisions

### VideoPlayer rewrite

- **D-01:** Remove the 135-line CF Stream manifest probe entirely. Pass `PUBLIC_STREAM_HLS_URL` directly to vidstack/HLS.js and let the player handle retries internally. No pre-mount fetch, no 204 handling, no master-to-rendition manifest flow.
- **D-02:** Detect "camera offline" (degraded state) via HLS.js `LEVEL_LOADED` events monitoring `EXT-X-MEDIA-SEQUENCE` progression. If the sequence number hasn't advanced in ~30s, enter `degraded`. Auto-recover when it advances again.
- **D-03:** The `liveSrc` prop interface on `VideoPlayer.svelte` stays — the value changes from a CF Stream signed URL to `PUBLIC_STREAM_HLS_URL`. The component is dramatically simplified but the external interface is preserved.
- **D-04:** Keep the `playerKey` remount-on-error pattern (increment forces fresh vidstack mount after fatal error). This is generic and works with self-hosted HLS.

### Page state machine (WEB-03)

- **D-05:** Collapse to exactly 4 states: `connecting | viewing | degraded | error`. Delete all demand/relay states (`idle`, `starting`, `live`, `ended`, `ended_confirming`, `unavailable`).
- **D-06:** Auto-play immediately on page load. No start button, no demand registration, no "click to start" CTA. Page loads → VideoPlayer mounts → HLS.js buffers → plays. `connecting` state shown briefly while HLS.js buffers.
- **D-07:** Degraded overlay: semi-transparent overlay on the frozen last frame showing "Camera offline — retrying..." with a subtle spinner. Auto-dismiss when stream resumes (MEDIA_SEQUENCE advances).
- **D-08:** Error state: simple error card with "Stream unavailable" message and a "Try again" button that reloads the player. No auto-retry after entering error — user-initiated only.
- **D-09:** Delete all demand/relay state variables: `demandRegistered`, `demandLoading`, `demandError`, `polling`, `startingTimestamp`, `startingUnavailableAccumulatedMs`, `startingUnavailableSince`, `relayStale`, `lastKnownRelayState`, `relayPrefetched`, and all associated constants (`POLL_INTERVAL_MS`, `STARTING_TIMEOUT_MS`, `MIN_STARTING_MS`).
- **D-10:** Delete `registerDemand()`, `prefetchRelayStatus()`, `pollRelayStatus()`, and `restartStream()` functions entirely.

### Deletion scope & KV (CLEAN-01 through CLEAN-05)

- **D-11:** Delete `routes/api/test-kv/` — dev scaffolding, no remaining purpose.
- **D-12:** Delete `RIVER_KV` binding from `wrangler.jsonc`, `RELAY_API_TOKEN` and `DEMAND_WINDOW_SECONDS` from platform env types in `app.d.ts`. No KV consumers remain.
- **D-13:** Delete `LiveViewerCount.svelte`. Keep `TelemetryFooter.svelte` (may be re-enabled later).
- **D-14:** Delete `$lib/server/posthog.ts` (server-side PostHog helper) — only consumers were the demand and relay-status endpoints being deleted. Client-side PostHog via `@posthog/sveltekit` is unaffected.
- **D-15:** Delete `$lib/types.ts` — all exports (`RelayState`, `DemandResponse`, `RelayStatusPayload`, `RelayStatusResponse`, stale threshold constants) are relay/demand-only. If new types are needed for the simplified state machine, create a fresh types file.
- **D-16:** Full deletion list per CLEAN-01 through CLEAN-05:
  - `packages/web/src/routes/stream.remote.ts` (JWT signing)
  - `packages/web/src/routes/stream.copy.remote.ts` (debug variant)
  - `packages/web/src/routes/api/stream/demand/+server.ts`
  - `packages/web/src/routes/api/relay/status/+server.ts`
  - `packages/web/src/routes/api/test-kv/+server.ts`
  - `packages/web/src/lib/components/LiveViewerCount.svelte`
  - `packages/web/src/lib/server/posthog.ts`
  - `packages/web/src/lib/types.ts`
  - Sidebar stream start button (in `+page.svelte`)
  - CF Stream env secrets from `.dev.vars` (`CF_STREAM_CUSTOMER_CODE`, `CF_STREAM_LIVE_INPUT_UID`, `CF_STREAM_SIGNING_KEY_ID`, `CF_STREAM_SIGNING_JWK`)
  - `RIVER_KV` binding + `RELAY_API_TOKEN` + `DEMAND_WINDOW_SECONDS` from `wrangler.jsonc` and `app.d.ts`
  - `packages/relay/` entire directory
  - `.github/workflows/deploy-relay.yml`
  - Root `package.json` scripts: `dev:relay`, `dev:all` (references relay), `build:relay`, `check:relay`
  - Root `package.json` workspaces: remove `packages/relay`
  - `turbo.json`: no changes expected (wildcard tasks)

### PostHog events

- **D-17:** Delete relay-era events: `stream_demand_failed`, `stream_demand_registered`, `relay_status_updated`.
- **D-18:** Keep and adapt client-side events:
  - `stream_viewed` — fire on page load (renamed if needed for clarity)
  - `stream_error` — fire on error state
  - `stream_degraded` — fire when entering degraded state (new event)
  - `stream_recovered` — fire when returning from degraded to viewing (new event)
  - `playback_buffering_started` — keep for debugging
  - `time_to_first_frame` — track time from page load to first video frame for performance monitoring

### Stream URL delivery

- **D-19:** `PUBLIC_STREAM_HLS_URL` is a SvelteKit `$env/static/public` build-time env var. Set in `.env` / `.dev.vars` / Cloudflare Workers env. Points to the MediaMTX HLS endpoint on the VPS (e.g., `https://stream.traskriver.com/trask/index.m3u8` or current equivalent).
- **D-20:** No server-side query, no JWT signing, no `stream.remote.ts`. The URL is a static public value — no secrets involved.

### the agent's Discretion

- Exact HLS.js configuration options for the simplified player (retry timers, buffer settings)
- MEDIA_SEQUENCE stall threshold (suggested ~30s, agent can tune based on MediaMTX's 2s segment/6-segment window)
- Exact PostHog event property schemas
- How to structure the `connecting` loading state UI (spinner, skeleton, etc.)
- Internal file organization for the dramatically simplified `+page.svelte`
- Whether to extract the degraded/error overlay into separate components or keep inline

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase inputs

- `.planning/ROADMAP.md` §"Phase 8: Web Swap + Full Cleanup" — 5 success criteria
- `.planning/REQUIREMENTS.md` §WEB-01 through §WEB-04, §CLEAN-01 through §CLEAN-05 — the requirements this phase satisfies

### Prior phase decisions that constrain Phase 8

- `.planning/phases/05-packages-stream-skeleton/05-CONTEXT.md` — Hono + Node 22 toolchain, `PUBLIC_STREAM_HLS_URL` concept
- `.planning/phases/06-mediamtx-supervisor-rtsp-ingest/06-CONTEXT.md` — MediaMTX HLS config (2s segments, 6-segment window, `hlsAlwaysRemux: yes`, HLS port 8888)
- `.planning/phases/07-health-endpoint-shared-types-purge/07-CONTEXT.md` — shared-types already purged, `/health` is ops-only

### Code surfaces to modify (read BEFORE planning)

- `packages/web/src/routes/+page.svelte` — main page with state machine, demand logic, player integration (~618 lines, will shrink dramatically)
- `packages/web/src/lib/components/VideoPlayer.svelte` — current player with CF Stream probe (~459 lines, will shrink dramatically)
- `packages/web/wrangler.jsonc` — KV binding and platform bindings to remove
- `packages/web/src/app.d.ts` — platform env types to strip

### Code surfaces to delete (verify existence before deleting)

- `packages/web/src/routes/stream.remote.ts` — JWT signing
- `packages/web/src/routes/stream.copy.remote.ts` — debug variant
- `packages/web/src/routes/api/stream/demand/+server.ts` — demand endpoint
- `packages/web/src/routes/api/relay/status/+server.ts` — relay status endpoint
- `packages/web/src/routes/api/test-kv/+server.ts` — dev KV test
- `packages/web/src/lib/components/LiveViewerCount.svelte` — dead component
- `packages/web/src/lib/server/posthog.ts` — server-side PostHog helper
- `packages/web/src/lib/types.ts` — relay/demand types
- `packages/relay/` — entire package
- `.github/workflows/deploy-relay.yml` — relay deploy workflow

### Workspace references to update

- Root `package.json` — remove relay workspace, relay scripts
- Root `turbo.json` — verify no relay-specific config (currently wildcard, likely no changes)

### Workspace conventions

- `.planning/codebase/CONVENTIONS.md` — Prettier config, strict TS, no ESLint
- `AGENTS.md` §"Learned User Preferences" — no unit tests unless asked

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **vidstack player integration** — the player mount/unmount pattern and `playerKey` remount-on-error in `VideoPlayer.svelte` are generic and reusable; only the CF Stream probe effect needs to be stripped.
- **`@posthog/sveltekit` client-side integration** — already wired in app layout; survives the cleanup and continues to work.
- **Sidebar/drawer layout** — unchanged by this phase; only the CTA button within the sidebar is removed.
- **`LocalWeather.svelte`** — unaffected, continues to display weather data.

### Established Patterns

- **SvelteKit `$env/static/public`** — already used for other public config; `PUBLIC_STREAM_HLS_URL` follows the same pattern.
- **Svelte 5 runes** (`$state`, `$effect`, `$derived`) — the existing state machine uses these; the simplified version will continue to.
- **PostHog client-side capture** — `$app.posthog?.capture()` pattern established in the page.

### Integration Points

- **`+page.svelte` ↔ `VideoPlayer.svelte`** — props interface (`liveSrc`, callbacks for state changes) stays; the data flowing through it changes from CF Stream URL to `PUBLIC_STREAM_HLS_URL`.
- **`.env` / `.dev.vars` / Cloudflare Workers env** — new `PUBLIC_STREAM_HLS_URL` var needs to be added to `.env.example` and set in production.
- **Root `package.json` workspaces** — removing `packages/relay` from the array; adding nothing (stream is already listed).
- **`wrangler.jsonc`** — strip KV and relay bindings; no new bindings needed.

</code_context>

<specifics>
## Specific Ideas

- The current `+page.svelte` is ~618 lines and `VideoPlayer.svelte` is ~459 lines. Both should shrink significantly — most of the complexity is demand/relay/CF Stream logic that's being deleted.
- `TelemetryFooter.svelte` is kept despite not being currently imported — user may re-enable it later.
- Stream service is already deployed and accessible on the VPS — no dependency on infra hardening phase for this to work.

</specifics>

<deferred>
## Deferred Ideas

- **VPS infra hardening** (systemd, TLS, OLS reverse proxy, camera DDNS/CVE documentation) — moved to v1.3
- **HLS cache-header rewriting** via reverse proxy — v1.3 (MediaMTX serves directly for now)
- **`/preview.jpg` latest-frame endpoint** — v1.3 backlog
- **LL-HLS upgrade** — v1.3 backlog
- **TelemetryFooter re-integration** — kept in codebase but not imported; re-enable when relevant

</deferred>

---

_Phase: 08-web-swap-full-cleanup_
_Context gathered: 2026-04-22_
