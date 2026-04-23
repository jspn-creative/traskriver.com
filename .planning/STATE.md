---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Self-Hosted Stream
status: complete
stopped_at: Completed 260423-h1q-PLAN.md
last_updated: '2026-04-23T19:21:28.841Z'
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 14
  completed_plans: 16
---

# State: Trask River Cam

## Project Reference

**Core value:** Users can see the Trask River live, on-demand, from anywhere
**Current milestone:** v1.2 — Self-Hosted Stream
**Current focus:** Phase 08 — web-swap-full-cleanup

## Current Position

Phase: 08 (web-swap-full-cleanup) — COMPLETE
Plan: 3 of 3 (complete)

## Accumulated Context

### Carried Forward

- Monolithic `+page.svelte` (~480 lines) will largely collapse in Phase 9
- vidstack is version-sensitive — pin and test on swap
- River Conditions Data deferred to v1.3 — see BACKLOG.md

### Milestone v1.2 Intent

- Replace Cloudflare Stream with self-hosted always-on `packages/stream` Node service on DigitalOcean droplet
- Pull RTSP directly via DDNS + public port-forward; **delete** `packages/relay` entirely (no cold fallback)
- Public HLS behind Cloudflare (orange-cloud default; grey-cloud documented fallback)
- Ships on a branch; merges when web deployment works against new backend — no cutover/parallel-run/observation/decommission phases
- CI/CD for stream service is user-owned and out of scope
- Node HTTP library: **Hono** + `@hono/node-server`

### Recent Decisions

- **[Quick 260423-h1q] Plan 01:** OLS `/trask/` route is now managed via marker-delimited idempotent config updates in `scripts/configure-stream-ols-route.sh`.
- **[Quick 260423-h1q] Plan 01:** Deploy now applies route config and reloads `lsws` only when config changed, with restart fallback on reload failure.
- **[Phase 08] Plan 03:** Deleted `packages/relay` + relay deploy workflow and removed relay workspace/scripts from root `package.json`.
- **[Phase 08] Plan 03:** Removed stale `packages/web/scripts/setup-signing.ts` and script entry after final orphan-reference scan.
- **[Phase 08] Plan 02:** Deleted all remaining relay-era web routes/helpers/types and removed worker KV/relay env bindings.
- **[Phase 08] Plan 02:** `hooks.server.ts` now constructs `PostHog` client directly after removing `$lib/server/posthog`.
- **[Phase 08] Plan 01:** Web playback now mounts `VideoPlayer` unconditionally and reads `env.PUBLIC_STREAM_HLS_URL` directly (no demand/relay/JWT path).
- **[Phase 08] Plan 01:** Degraded/recovered state is driven by HLS `LEVEL_LOADED` media-sequence progression checks (~30s stall threshold).
- **Phase 6 supervisor:** backoff 1→30s, stall 75s, codec guard fatal on non-H264; static gates green (`06-04-SUMMARY.md`, rollup `06-SUMMARY.md`)
- **Phase 5 HTTP stack:** Hono + `@hono/node-server` (see `05-CONTEXT.md`; scaffold deps in `packages/stream/package.json`)
- **v1.2 scope:** branch-based delivery, no parallel-run or cutover window (app not in active use)
- **v1.2 scope:** delete `packages/relay` (not retire-in-place); no cold-fallback strategy
- **v1.2 scope:** orange-cloud default; no ToS P0 gate; grey-cloud is execution-time fallback
- **[Phase 06] Plan 01:** Foundation modules — zod Phase 6 keys, Pino RTSP redaction, `buildMediamtxYaml`, `getPathInfo` (`06-01-SUMMARY.md`)
- **[Phase 06] Plan 02:** `Supervisor` in `packages/stream/src/supervisor.ts` — spawn/backoff/poll/codec guard/stall watchdog; constructor uses explicit fields for `erasableSyntaxOnly` (`06-02-SUMMARY.md`)
- **[Phase 06] Plan 03:** `createApp({ getStatus })` + index boot/shutdown wiring — no health singleton; supervisor teardown before `server.close` (`06-03-SUMMARY.md`)
- **[Phase 07] Plans 01-04:** `packages/shared` is now intentionally empty (`export {}`) and relay/web shared contracts are localized to owning packages (`07-01-SUMMARY.md`, `07-04-SUMMARY.md`)
- **[Phase 07] Plans 02-03:** `/health` is host-gated via `OPS_HOSTS` and wired to `Supervisor.getHealthSnapshot()` including codec mismatch visibility (`07-02-SUMMARY.md`, `07-03-SUMMARY.md`)
- **Roadmap pivot:** Old Phase 8 (VPS/DNS/Camera infra) deferred to v1.3; old Phase 9 (web swap + cleanup) promoted to Phase 8 as final v1.2 phase. Stream service already running on VPS.

### Blockers

- _None_

### Quick Tasks Completed

| #          | Description                                                                                                                   | Date       | Commit  | Directory                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| 260423-h1q | make https://stream.traskriver.com/trask/index.m3u8 accessible remotely (fix 404 via xCloud/OLS routing for app on port 8088) | 2026-04-23 | 753e352 | [260423-h1q-make-https-stream-traskriver-com-trask-i](./quick/260423-h1q-make-https-stream-traskriver-com-trask-i/) |

## Session Continuity

### Last Session

- **Date:** 2026-04-22
- **Activity:** Executed `08-03-PLAN.md`, deleted relay package/workflow, cleaned workspaces, and verified `bun check` + `bun lint` green.

### Next Session Should

1. Run milestone v1.2 closeout (`/gsd-complete-milestone`) now that Phase 08 is complete.

Last activity: 2026-04-23 - Completed quick task 260423-h1q: make https://stream.traskriver.com/trask/index.m3u8 accessible remotely (fix 404 via xCloud/OLS routing for app on port 8088)

**Stopped At:** Completed 260423-h1q-PLAN.md

---

## Performance Metrics

| Run                                                                 | Duration | Tasks   | Files    |
| ------------------------------------------------------------------- | -------- | ------- | -------- |
| Phase 06 P01                                                        | 12m      | 3 tasks | 5 files  |
| Phase 06-mediamtx-supervisor-rtsp-ingest P02                        | 5m       | 1 tasks | 1 files  |
| Phase 06-mediamtx-supervisor-rtsp-ingest P03                        | 1m       | 2 tasks | 2 files  |
| Phase 06-mediamtx-supervisor-rtsp-ingest P04                        | 10m      | 2 tasks | 4 files  |
| Phase 07-health-endpoint-shared-types-purge P02                     | 6m       | 2 tasks | 2 files  |
| Phase 07 P01                                                        | 5m       | 3 tasks | 11 files |
| Phase 07-health-endpoint-shared-types-purge P04                     | 3m       | 2 tasks | 6 files  |
| Phase 08 P01                                                        | 6 min    | 2 tasks | 4 files  |
| Phase 08 P02                                                        | 1m       | 2 tasks | 11 files |
| Phase 08-web-swap-full-cleanup P03                                  | 3m       | 3 tasks | 28 files |
| Phase quick-260423-h1q-make-https-stream-traskriver-com-trask-i P01 | 2m       | 3 tasks | 3 files  |
