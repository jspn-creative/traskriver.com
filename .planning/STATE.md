---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Self-Hosted Stream
status: unknown
stopped_at: Phase 6 context gathered
last_updated: '2026-04-21T00:13:33.998Z'
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 3
  completed_plans: 4
---

# State: Trask River Cam

## Project Reference

**Core value:** Users can see the Trask River live, on-demand, from anywhere
**Current milestone:** v1.2 — Self-Hosted Stream
**Current focus:** Phase 6 — MediaMTX supervisor + RTSP ingest (plan next)

## Current Position

Phase: 05 (packages-stream-skeleton) — **COMPLETE**
Plan: 3 of 3 done — SUMMARY: `05-03-SUMMARY.md`, rollup: `05-SUMMARY.md`

**Stopped at:** Phase 6 context gathered

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

- **Phase 5 HTTP stack:** Hono + `@hono/node-server` (see `05-CONTEXT.md`; scaffold deps in `packages/stream/package.json`)
- **v1.2 scope:** branch-based delivery, no parallel-run or cutover window (app not in active use)
- **v1.2 scope:** delete `packages/relay` (not retire-in-place); no cold-fallback strategy
- **v1.2 scope:** orange-cloud default; no ToS P0 gate; grey-cloud is execution-time fallback

### Blockers

- _None_

## Session Continuity

### Last Session

- **Date:** 2026-04-20
- **Activity:** Executed `05-03-PLAN.md` — verification (build, `node --check`, smoke, fail-fast, `bun check`), SUMMARY + STATE/ROADMAP

### Next Session Should

1. Plan or execute Phase 6 — MediaMTX supervisor + RTSP ingest (per ROADMAP)

---

_Last updated: 2026-04-20_
