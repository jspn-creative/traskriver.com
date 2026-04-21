# Roadmap: Trask River Cam

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-04-13)
- ✅ **v1.1 Analytics & User-Ready Polish** — (shipped 2026-04-20)
- 🚧 **v1.2 Self-Hosted Stream** — Phases 5-9 (in progress)
- 📋 **v1.3 River Conditions Data** — (backlog)

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
- [ ] **Phase 6: MediaMTX Supervisor + RTSP Ingest** — Spawn/backoff supervisor, stall watchdog, codec guard, H.264 passthrough HLS config.
- [ ] **Phase 7: `/health` Endpoint + Shared-Types Purge** — Full `/health` payload bound to ops-only surface; strip relay/demand/JWT types from `packages/shared`.
- [ ] **Phase 8: VPS + DNS + Camera Infrastructure** — DO droplet systemd deploy, TLS, Cloudflare DNS, router port-forward, camera H.264/DDNS/CVE check.
- [ ] **Phase 9: Web Swap + Full Cleanup** — Point `VideoPlayer` at new HLS URL, collapse state machine, delete `packages/relay`, stream/demand/KV routes, CF Stream bindings, workspace refs.

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

**Goal**: The Node supervisor spawns MediaMTX, keeps the RTSP→HLS pipeline alive 24/7 with correct backoff, detects stalls, guards codec, and serves H.264 passthrough HLS on tmpfs. MediaMTX serves HLS on its own HTTP origin port; cache-header rewriting is deferred to Phase 8 (reverse proxy).
**Depends on**: Phase 5
**Requirements**: STRM-02, STRM-03, STRM-04, STRM-05, STRM-06, STRM-07
**Success Criteria** (what must be TRUE):

1. `kill -9 $(pgrep mediamtx)` on a running stream service triggers supervisor restart with exponential backoff (1→30s cap, reset on 60s clean uptime); SIGTERM shutdown escalates to SIGKILL after 10s.
2. Unplugging the camera for ≥90s flips the supervisor out of `ready` and triggers a supervised restart; reconnect resumes video with a fresh HLS manifest (new random segment prefix + `EXT-X-MEDIA-SEQUENCE:0`) that hls.js/vidstack handles as a discontinuity. (MediaMTX destroys + recreates the muxer rather than emitting a literal `#EXT-X-DISCONTINUITY` tag; functionally equivalent for playback clients.)
3. If MediaMTX's API reports a non-`H264` ingest codec, the supervisor refuses to enter `ready` and logs `FATAL: camera codec is {actual}, expected H264`.
4. `curl http://localhost:8888/trask/index.m3u8` returns a manifest with 2s segment duration and 6-segment window. (Cache-Control rewriting to `public, max-age=1` on `.m3u8` and `public, max-age=86400, immutable` on `.ts` is handled by the Phase 8 reverse proxy — MediaMTX's built-in HLS server cannot emit these headers directly.)
5. HLS segments are written to `HLS_DIR` (defaulting to `/run/stream/hls`, which becomes tmpfs in Phase 8 via `RuntimeDirectory=stream`) and served by MediaMTX's HTTP origin port, not by the Node HTTP server. `hlsAlwaysRemux: yes` keeps the muxer running so first-viewer latency after a restart stays low.

**Plans:** 2/4 plans executed

- [x] 06-01-PLAN.md — Foundation modules: extend zod schema (5 env keys), add Pino RTSP_URL redaction, create mediamtx-config.ts (literal yaml template, hlsAlwaysRemux: yes, rtspTransport: tcp), create mediamtx-api.ts (native fetch + AbortSignal.timeout) _(complete 2026-04-21)_
- [x] 06-02-PLAN.md — Supervisor core: class with state machine, child_process.spawn, exponential backoff (1→30s, reset on 60s clean), SIGTERM→10s→SIGKILL, codec guard, stall watchdog (5s poll, 75s threshold) _(complete 2026-04-21)_
- [ ] 06-03-PLAN.md — Wiring: createApp accepts getStatus accessor; index.ts boot integrates Supervisor (construct→app→serve→start), shutdown reverses order (supervisor first, then HTTP)
- [ ] 06-04-PLAN.md — Verify: `bun run build --filter=stream`, `node --check dist/*.js`, `bun check`, write 06-SUMMARY.md, advance STATE/ROADMAP, commit phase

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
   **Plans**: TBD

### Phase 8: VPS + DNS + Camera Infrastructure

**Goal**: The DigitalOcean droplet runs `packages/stream` under systemd with TLS, cache-header rewriting, and log retention; Cloudflare DNS resolves `stream.traskriver.com` to it; the home router forwards only RTSP; the camera is hardened and producing H.264.
**Depends on**: Phase 5 (needs a deployable package) · code-path independent of Phase 6/7 — can progress in parallel with them
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06
**Success Criteria** (what must be TRUE):

1. `systemctl status stream` on the droplet shows `active (running)` with `Restart=always`, `MemoryMax`, `LimitNOFILE`, `RuntimeDirectory=stream`, and `StartLimitBurst` tuned; journald retention capped near 500M.
2. `dig stream.traskriver.com` returns Cloudflare-proxied (orange-cloud) A record; `curl -I https://stream.traskriver.com/...` returns valid Let's Encrypt TLS with auto-renewal timer armed on the droplet.
3. OpenLiteSpeed (already on the droplet) fronts MediaMTX's HLS origin port with `Cache-Control: public, max-age=1` on `.m3u8` responses and `Cache-Control: public, max-age=86400, immutable` on `.ts` responses. (Caddy is a documented fallback if OLS config proves impractical.)
4. External scan from the VPS (`nmap -p 554 cam.ddns.example`) returns `open`; other ports (80, 443, 8000, 37777) return `filtered`/`closed`; UPnP disabled on router.
5. Camera DDNS hostname resolves to home WAN; camera produces H.264 at 2s closed GOP, 3–6 Mbps CBR; a dedicated RTSP-only user (20+ char password, distinct from admin) is configured.
6. `FIRMWARE.md` records current camera model + firmware version + date, with CVE pre-flight checked against CVE-2021-33044/45, CVE-2025-31700/31701, CVE-2025-65857, CVE-2025-66176/66177.
   **Plans**: TBD

### Phase 9: Web Swap + Full Cleanup

**Goal**: The web client plays from the new self-hosted HLS URL, the page state machine is collapsed to `connecting → viewing ⇌ degraded → error`, and every trace of the relay/demand/JWT/Cloudflare Stream path is deleted in the same branch that ships the milestone.
**Depends on**: Phases 6, 7, 8 (needs working origin + clean shared types)
**Requirements**: WEB-01, WEB-02, WEB-03, WEB-04, CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-05
**Success Criteria** (what must be TRUE):

1. Opening the site in Chrome (macOS + Windows), Firefox, Safari (iOS + macOS) reaches a playing stream within ≤5s from `PUBLIC_STREAM_HLS_URL`; no browser-console 4xx requests to deleted routes.
2. Disconnecting the camera flips the UI into `degraded` with a "Camera offline — retrying" overlay (driven by hls.js `LEVEL_LOADED` / `#EXT-X-MEDIA-SEQUENCE` progression, NOT `/health` polling); restoring the camera auto-recovers to `viewing`.
3. Page state machine has exactly four states (`connecting`, `viewing`, `degraded`, `error`); no start button, no demand POST, no relay-status polling, no `LiveViewerCount`.
4. Branch shows `packages/relay` deleted (including its GitHub Actions workflow + Tailscale CI docs); `routes/stream.remote.ts`, `routes/api/stream/demand/`, `routes/api/relay/status/`, `routes/api/test-kv/`, `lib/components/LiveViewerCount.svelte`, sidebar start button all deleted; `wrangler.jsonc` has no CF Stream bindings and `RIVER_KV` is removed if unused.
5. `turbo.json`, root `package.json`, tsconfig paths reflect the removed `packages/relay` and added `packages/stream`; `bun check` + `bun lint` pass repo-wide.
   **Plans**: TBD

## Progress

**Execution Order:** Phases execute in numeric order: 5 → 6 → 7 → 8 → 9

| Phase                                | Milestone | Plans Complete | Status      | Completed  |
| ------------------------------------ | --------- | -------------- | ----------- | ---------- |
| 1. MVP Pipeline                      | v1.0      | —              | Complete    | 2026-04-13 |
| 2. MVP Pipeline                      | v1.0      | —              | Complete    | 2026-04-13 |
| 3. MVP Pipeline                      | v1.0      | —              | Complete    | 2026-04-13 |
| 4. MVP Pipeline                      | v1.0      | —              | Complete    | 2026-04-13 |
| v1.1 phases                          | v1.1      | —              | Complete    | 2026-04-20 |
| 5. `packages/stream` Skeleton        | v1.2      | 3/3            | Complete    | 2026-04-20 |
| 6. MediaMTX Supervisor + RTSP Ingest | v1.2      | 0/4            | Not started | -          |
| 7. `/health` + Shared-Types Purge    | v1.2      | 0/TBD          | Not started | -          |
| 8. VPS + DNS + Camera Infra          | v1.2      | 0/TBD          | Not started | -          |
| 9. Web Swap + Full Cleanup           | v1.2      | 0/TBD          | Not started | -          |

## Backlog

See `.planning/BACKLOG.md` for deferred work.

---

_Roadmap updated: 2026-04-20 — Phase 5 complete; v1.2 phases 6-9 next_
