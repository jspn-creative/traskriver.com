---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Self-Hosted Stream
status: ready-to-plan
stopped_at: Roadmap created — Phase 5 ready to plan
last_updated: '2026-04-20T00:00:00.000Z'
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# State: Trask River Cam

## Project Reference

**Core value:** Users can see the Trask River live, on-demand, from anywhere
**Current milestone:** v1.2 — Self-Hosted Stream
**Current focus:** Phase 5 — `packages/stream` Skeleton

## Current Position

**Phase:** 5 of 9 — `packages/stream` Skeleton
**Plan:** — (plans TBD)
**Status:** Ready to plan
**Last activity:** 2026-04-20 — Roadmap for v1.2 defined (phases 5-9)

Progress: [░░░░░░░░░░] 0%

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
- Node HTTP library (Fastify / Hono / node:http / Elysia) decided during Phase 5 planning

### Recent Decisions

- **v1.2 scope:** branch-based delivery, no parallel-run or cutover window (app not in active use)
- **v1.2 scope:** delete `packages/relay` (not retire-in-place); no cold-fallback strategy
- **v1.2 scope:** orange-cloud default; no ToS P0 gate; grey-cloud is execution-time fallback

### Blockers

- _None_

## Session Continuity

### Last Session

- **Date:** 2026-04-20
- **Activity:** ROADMAP.md written with 5 phases covering all 23 v1.2 requirements

### Next Session Should

1. `/gsd-plan-phase 5` — plan the `packages/stream` skeleton
2. Decide Node HTTP library (Fastify / Hono / node:http / Elysia) during Phase 5 planning

---

_Last updated: 2026-04-20_
