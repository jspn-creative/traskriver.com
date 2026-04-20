# Milestones

## v1.1 Analytics & User-Ready Polish (Shipped: 2026-04-20)

**Phases completed:** 4 phases, 4 plans, 6 tasks

**Key accomplishments:**

- VideoPlayer now relies on HLS.js backoff instead of a 4s remount loop; fatal errors still notify the page after one optional delayed remount.
- Stream tokens last one hour; the home page only treats confirmed playback loss as a stream-end when the user was already in `viewing`.
- 1. [Rule 1 - Bug] Upstream path /tracker returns 404; correct path is /collect for GET
- Static stacked sidebar with river branding, hourly Open-Meteo weather, and sticky stream control; product-page panel removed and copy de-jargoned.

---

## v1.2 Stream Reliability & Error Handling (Shipped: 2026-04-13)

**Phases completed:** 2 phases, 3 plans, 6 tasks (estimated from plan execution)

**Key accomplishments:**

- HLS.js-native recovery replaces destructive remount loop; consolidated error handling and quieter startup logs
- Stream JWT TTL 3600s; page state machine only enters `ended_confirming` after confirmed `viewing` playback loss
- Counterscale CORS proxy Worker (`counterscale-proxy.jspn.workers.dev`) + layout `reporterUrl` — zero CORS errors on production

**Archive:** [Roadmap](milestones/v1.2-ROADMAP.md) · [Requirements](milestones/v1.2-REQUIREMENTS.md)

---
