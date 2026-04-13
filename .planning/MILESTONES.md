# Milestones

## v1.2 Stream Reliability & Error Handling (Shipped: 2026-04-13)

**Phases completed:** 2 phases, 3 plans, 6 tasks (estimated from plan execution)

**Key accomplishments:**

- HLS.js-native recovery replaces destructive remount loop; consolidated error handling and quieter startup logs
- Stream JWT TTL 3600s; page state machine only enters `ended_confirming` after confirmed `viewing` playback loss
- Counterscale CORS proxy Worker (`counterscale-proxy.jspn.workers.dev`) + layout `reporterUrl` — zero CORS errors on production

**Archive:** [Roadmap](milestones/v1.2-ROADMAP.md) · [Requirements](milestones/v1.2-REQUIREMENTS.md)

---
