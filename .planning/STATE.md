---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Self-Hosted Stream
status: executing
stopped_at: Phase 8 context gathered (web swap + full cleanup)
last_updated: '2026-04-22T20:32:17.106Z'
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 11
  completed_plans: 13
  percent: 100
---

# State: Trask River Cam

## Project Reference

**Core value:** Users can see the Trask River live, on-demand, from anywhere
**Current milestone:** v1.2 — Self-Hosted Stream
**Current focus:** Phase 08 — web-swap-full-cleanup

## Current Position

Phase: 08 (web-swap-full-cleanup) — NEXT
Plan: 0 of TBD

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

## Session Continuity

### Last Session

- **Date:** 2026-04-22
- **Activity:** Executed Phase 07 plans (`07-01` through `07-04`) and verified phase completion (`bun check` green; summaries for all four plans present)

### Next Session Should

1. Plan and execute Phase 8 — Web swap (point VideoPlayer at self-hosted HLS) + full cleanup (delete relay, demand, JWT, CF Stream paths)

**Stopped At:** Phase 8 context gathered (web swap + full cleanup)

---

## Performance Metrics

| Run                                             | Duration | Tasks   | Files    |
| ----------------------------------------------- | -------- | ------- | -------- |
| Phase 06 P01                                    | 12m      | 3 tasks | 5 files  |
| Phase 06-mediamtx-supervisor-rtsp-ingest P02    | 5m       | 1 tasks | 1 files  |
| Phase 06-mediamtx-supervisor-rtsp-ingest P03    | 1m       | 2 tasks | 2 files  |
| Phase 06-mediamtx-supervisor-rtsp-ingest P04    | 10m      | 2 tasks | 4 files  |
| Phase 07-health-endpoint-shared-types-purge P02 | 6m       | 2 tasks | 2 files  |
| Phase 07 P01                                    | 5m       | 3 tasks | 11 files |
| Phase 07-health-endpoint-shared-types-purge P04 | 3m       | 2 tasks | 6 files  |
