# Roadmap: Trask River Cam

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-04-13)
- ✅ **v1.1 Analytics & User-Ready Polish** — (shipped 2026-04-20)
- 🚧 **v1.2 Self-Hosted Stream** — Phases 5-8 (in progress)
- 📋 **v1.3 Infra Hardening + River Conditions** — (backlog)

## Phases

### 🚧 v1.2 Self-Hosted Stream (In Progress)

**Milestone Goal:** Replace Cloudflare Stream with an always-on `packages/stream` Node service on a DigitalOcean droplet that pulls RTSP directly from the camera and serves public HLS. Eliminate CF Stream cold-start + usage caps and remove the Pi relay from the repo. Ships on a branch; merges when the web deployment works against the new backend.

**Scope notes:**

- No cutover, parallel-run, observation window, or decommission phase — app is not in active use; branch-based delivery.
- `packages/relay` is **deleted** (not retired-in-place); no cold-fallback strategy.
- Cloudflare zone is orange-cloud by default; grey-cloud documented as fallback if ToS is enforced (not a planning gate).
- CGNAT detection is an execution-time abort trigger (re-scope), not a phase.
- Node HTTP library: **Hono** + `@hono/node-server` (locked Phase 5 — see `05-CONTEXT.md`).

- [x] **Phase 5: `packages/stream` Skeleton** — Bootstrap new Node 22 ESM package with zod config, Pino logger, and placeholder `/health`.
- [x] **Phase 6: MediaMTX Supervisor + RTSP Ingest** — Spawn/backoff supervisor, stall watchdog, codec guard, H.264 passthrough HLS config.
- [x] **Phase 7: `/health` Endpoint + Shared-Types Purge** — Full `/health` payload bound to ops-only surface; strip relay/demand/JWT types from `packages/shared`.
- [x] **Phase 8: Web Swap + Full Cleanup** — Point `VideoPlayer` at new HLS URL, collapse state machine, delete `packages/relay`, stream/demand/KV routes, CF Stream bindings, workspace refs.

## Phase Details

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED 2026-04-13</summary>

Phases 1-4 delivered on-demand RTSP → ffmpeg → Cloudflare Stream pipeline, relay state machine, responsive web UI, weather, telemetry footer, Pi deployment via Tailscale.

</details>

<details>
<summary>✅ v1.1 Analytics & User-Ready Polish — SHIPPED 2026-04-20</summary>

PostHog analytics (replaced Counterscale), sidebar overhaul with branding + weather + sticky stream control, copy cleanup for angler audience. HLS.js-native recovery, stream token TTL adjustments.

</details>

### Phase 5: `packages/stream` Skeleton

**Goal**: A new Node 22 ESM package exists, builds cleanly against a Node-target tsconfig, and emits structured Pino logs with zod-validated config — ready to host the supervisor in Phase 6.
**Depends on**: Nothing (first v1.2 phase; parallel with Phases 8 infra prep if desired)
**Requirements**: STRM-01
**Success Criteria** (what must be TRUE):

1. `packages/stream` exists with `"type": "module"`, `engines.node: ">=22"`, Node-target tsconfig (no DOM/Workers types).
2. `bun run build --filter=stream` succeeds from a clean clone and `node --check dist/index.js` passes.
3. Boot validates env via zod; missing required vars fail fast with a clear error.
4. Pino JSON logs emit to stdout; dev uses `pino-pretty`; process listens on a placeholder `/health` endpoint returning `{ status: "starting" }`.
5. Node HTTP library choice recorded (Hono + `@hono/node-server` — see `05-CONTEXT.md`).

**Plans:** 3 plans

- [x] 05-01-PLAN.md — Scaffold `packages/stream/` (package.json, tsconfig, .gitignore, README) + wire into monorepo workspaces + turbo outputs _(complete 2026-04-20)_
- [x] 05-02-PLAN.md — Author src files: zod config, Pino logger, Hono `/health` app, boot + SIGTERM/SIGINT lifecycle _(complete 2026-04-20)_
- [x] 05-03-PLAN.md — Build, `node --check dist/index.js`, smoke-boot `/health`, fail-fast check, `bun run check`, commit phase _(complete 2026-04-20)_

### Phase 6: MediaMTX Supervisor + RTSP Ingest

**Goal**: The Node supervisor spawns MediaMTX, keeps the RTSP→HLS pipeline alive 24/7 with correct backoff, detects stalls, guards codec, and serves H.264 passthrough HLS on tmpfs. MediaMTX serves HLS on its own HTTP origin port; cache-header rewriting is deferred to infra hardening (v1.3).
**Depends on**: Phase 5
**Requirements**: STRM-02, STRM-03, STRM-04, STRM-05, STRM-06, STRM-07
**Success Criteria** (what must be TRUE):

1. `kill -9 $(pgrep mediamtx)` on a running stream service triggers supervisor restart with exponential backoff (1→30s cap, reset on 60s clean uptime); SIGTERM shutdown escalates to SIGKILL after 10s.
2. Unplugging the camera for ≥90s flips the supervisor out of `ready` and triggers a supervised restart; reconnect resumes video with a fresh HLS manifest (new random segment prefix + `EXT-X-MEDIA-SEQUENCE:0`) that hls.js/vidstack handles as a discontinuity. (MediaMTX destroys + recreates the muxer rather than emitting a literal `#EXT-X-DISCONTINUITY` tag; functionally equivalent for playback clients.)
3. If MediaMTX's API reports a non-`H264` ingest codec, the supervisor refuses to enter `ready` and logs `FATAL: camera codec is {actual}, expected H264`.
4. `curl http://localhost:8888/trask/index.m3u8` returns a manifest with 2s segment duration and 6-segment window. (Cache-Control rewriting to `public, max-age=1` on `.m3u8` and `public, max-age=86400, immutable` on `.ts` is handled by the Phase 8 reverse proxy — MediaMTX's built-in HLS server cannot emit these headers directly.)
5. HLS segments are written to `HLS_DIR` (defaulting to `/run/stream/hls`, which becomes tmpfs in Phase 8 via `RuntimeDirectory=stream`) and served by MediaMTX's HTTP origin port, not by the Node HTTP server. `hlsAlwaysRemux: yes` keeps the muxer running so first-viewer latency after a restart stays low.

**Plans:** 4 plans

- [x] 06-01-PLAN.md — Foundation modules: extend zod schema (5 env keys), add Pino RTSP*URL redaction, create mediamtx-config.ts (literal yaml template, hlsAlwaysRemux: yes, rtspTransport: tcp), create mediamtx-api.ts (native fetch + AbortSignal.timeout) *(complete 2026-04-21)\_
- [x] 06-02-PLAN.md — Supervisor core: class with state machine, child*process.spawn, exponential backoff (1→30s, reset on 60s clean), SIGTERM→10s→SIGKILL, codec guard, stall watchdog (5s poll, 75s threshold) *(complete 2026-04-21)\_
- [x] 06-03-PLAN.md — Wiring: createApp accepts getStatus accessor; index.ts boot integrates Supervisor (construct→app→serve→start), shutdown reverses order (supervisor first, then HTTP) _(complete 2026-04-21)_
- [x] 06-04-PLAN.md — Verify: `bun run build --filter=@traskriver/stream`, `node --check dist/*.js`, `bun check`, write 06-SUMMARY.md, advance STATE/ROADMAP, commit phase _(complete 2026-04-20)_

### Phase 7: `/health` Endpoint + Shared-Types Purge

**Goal**: The stream service exposes a complete ops-only `/health` payload, and `packages/shared` is stripped of relay/demand/JWT types so Phase 9 deletions have nothing to drag along.
**Depends on**: Phase 6 (for supervisor state) · parallelizable with Phase 8
**Requirements**: STRM-08, CLEAN-04
**Success Criteria** (what must be TRUE):

1. `GET /health` returns `{ status, rtspConnected, codec, lastSegmentWrittenAgoMs, restartsLast1h, uptimeMs }` reflecting live supervisor state.
2. `/health` is bound to an ops-only interface (Tailscale or `ops.*` host) and is NOT reachable via the public HLS hostname.
3. Codec guard transitions surface in `/health` (e.g. `status: "codec_mismatch"` when non-H.264 detected).
4. `packages/shared` root `index.ts` no longer exports any relay/demand/JWT types; `RelayState`, `DemandResponse`, `RelayStatusPayload`, `RELAY_STATUS_*`, `RelayConfig`, etc. are removed.
5. `bun check` passes repo-wide after the shared-types purge (no orphaned imports).

**Plans:** 4 plans

- [x] 07-01-PLAN.md — Shared-types purge part 1: re-home relay types + relay import migration (CLEAN-04) _(complete 2026-04-22)_
- [x] 07-02-PLAN.md — Supervisor extension: `HealthSnapshot` type, `getHealthSnapshot()`, rolling 1h restart counter, `SegmentWatcher`, non-exiting `codecMismatch` state (STRM-08) _(complete 2026-04-22)_
- [x] 07-03-PLAN.md — HTTP wiring: `OPS_HOSTS` zod config, `createApp({ getHealth, opsHosts })` with Host-gate 404 middleware, `index.ts` wiring, build verify (STRM-08) _(complete 2026-04-22)_
- [x] 07-04-PLAN.md — Shared-types purge part 2: re-home web types, empty `packages/shared/index.ts`, final `bun check` (CLEAN-04) _(complete 2026-04-22)_

### Phase 8: Web Swap + Full Cleanup

**Goal**: The web client plays from the new self-hosted HLS URL, the page state machine is collapsed to `connecting → viewing ⇌ degraded → error`, and every trace of the relay/demand/JWT/Cloudflare Stream path is deleted in the same branch that ships the milestone.
**Depends on**: Phases 6, 7 (needs working origin + clean shared types) · stream service already deployed on VPS
**Requirements**: WEB-01, WEB-02, WEB-03, WEB-04, CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-05
**Success Criteria** (what must be TRUE):

1. Opening the site in Chrome (macOS + Windows), Firefox, Safari (iOS + macOS) reaches a playing stream within ≤5s from `PUBLIC_STREAM_HLS_URL`; no browser-console 4xx requests to deleted routes.
2. Disconnecting the camera flips the UI into `degraded` with a "Camera offline — retrying" overlay (driven by hls.js `LEVEL_LOADED` / `#EXT-X-MEDIA-SEQUENCE` progression, NOT `/health` polling); restoring the camera auto-recovers to `viewing`.
3. Page state machine has exactly four states (`connecting`, `viewing`, `degraded`, `error`); no start button, no demand POST, no relay-status polling, no `LiveViewerCount`.
4. Branch shows `packages/relay` deleted (including its GitHub Actions workflow + Tailscale CI docs); `routes/stream.remote.ts`, `routes/api/stream/demand/`, `routes/api/relay/status/`, `routes/api/test-kv/`, `lib/components/LiveViewerCount.svelte`, sidebar start button all deleted; `wrangler.jsonc` has no CF Stream bindings and `RIVER_KV` is removed if unused.
5. `turbo.json`, root `package.json`, tsconfig paths reflect the removed `packages/relay` and added `packages/stream`; `bun check` + `bun lint` pass repo-wide.
   **Plans:** 3 plans

- [x] 08-01-PLAN.md — Rewrite VideoPlayer.svelte + +page.svelte: direct HLS playback, 4-state machine, MEDIA_SEQUENCE stall detection, PostHog events _(complete 2026-04-22)_
- [x] 08-02-PLAN.md — Delete dead relay/demand/JWT/CF Stream files, clean wrangler.jsonc/app.d.ts/.dev.vars bindings _(complete 2026-04-22)_
- [x] 08-03-PLAN.md — Delete packages/relay + workflow, clean workspace refs, verify bun check + bun lint _(complete 2026-04-22)_

## Progress

**Execution Order:** Phases execute in numeric order: 5 → 6 → 7 → 8

| Phase                                | Milestone | Plans Complete | Status   | Completed  |
| ------------------------------------ | --------- | -------------- | -------- | ---------- |
| 1. MVP Pipeline                      | v1.0      | —              | Complete | 2026-04-13 |
| 2. MVP Pipeline                      | v1.0      | —              | Complete | 2026-04-13 |
| 3. MVP Pipeline                      | v1.0      | —              | Complete | 2026-04-13 |
| 4. MVP Pipeline                      | v1.0      | —              | Complete | 2026-04-13 |
| v1.1 phases                          | v1.1      | —              | Complete | 2026-04-20 |
| 5. `packages/stream` Skeleton        | v1.2      | 3/3            | Complete | 2026-04-20 |
| 6. MediaMTX Supervisor + RTSP Ingest | v1.2      | 4/4            | Complete | 2026-04-20 |
| 7. `/health` + Shared-Types Purge    | v1.2      | 4/4            | Complete | 2026-04-22 |
| 8. Web Swap + Full Cleanup           | v1.2      | 3/3            | Complete | 2026-04-22 |

## Backlog

See `.planning/BACKLOG.md` for deferred work.

---

_Roadmap updated: 2026-04-22 — Phase 7 complete; old Phase 8 (infra) deferred to v1.3; web swap promoted to Phase 8_
