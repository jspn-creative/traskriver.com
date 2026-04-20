---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Self-Hosted Stream
status: defining-requirements
stopped_at: Milestone v1.2 started — research queued
last_updated: '2026-04-20T00:00:00.000Z'
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# State: Trask River Cam

## Project Reference

**Core value:** Users can see the Trask River live, on-demand, from anywhere
**Current milestone:** v1.2 — Self-Hosted Stream
**Current focus:** Defining requirements

## Current Position

**Phase:** Not started (defining requirements)
**Plan:** —
**Status:** Defining requirements
**Last activity:** 2026-04-20 — Milestone v1.2 started

## Accumulated Context

### Carried Forward

- Monolithic `+page.svelte` (~480 lines) identified as tech debt — consider extracting during stream migration
- `LiveViewerCount.svelte` has console noise on every poll — clean up if touched
- vidstack is version-sensitive — pin and test after changes
- River Conditions Data deferred to v1.3 — see BACKLOG.md

### Milestone v1.2 Intent

- Replace Cloudflare Stream with self-hosted always-on `packages/stream` Node service on VPS
- Pull RTSP directly from camera via DDNS + port forward; retire Pi relay from active path
- Serve public HLS behind Cloudflare CDN; drop JWT signing
- CI/CD and VPS provisioning are user-owned and out of GSD scope

### Blockers

- _None_

## Session Continuity

### Last Session

- **Date:** 2026-04-20
- **Activity:** Milestone v1.2 kicked off — scope confirmed, research queued

### Next Session Should

1. Review research SUMMARY.md
2. Finalize requirements and roadmap

---

_Last updated: 2026-04-20_
