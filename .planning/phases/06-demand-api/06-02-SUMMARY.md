---
phase: 06-demand-api
plan: 02
subsystem: api
tags: [sveltekit, workers, kv, bearer-auth]

requires:
  - phase: 06-demand-api
    provides: Plan 01 types and KV binding
provides:
  - POST/GET /api/stream/demand
  - POST /api/relay/status
affects: [07-relay-service]

tech-stack:
  added: []
  patterns: [read-before-write throttle, bearer auth for relay routes]

key-files:
  created:
    - packages/web/src/routes/api/stream/demand/+server.ts
    - packages/web/src/routes/api/relay/status/+server.ts
  modified: []

key-decisions:
  - Demand POST public; GET bearer-protected; 30s KV write throttle; no expirationTtl on demand key
  - Relay status KV TTL 120s heartbeat

patterns-established:
  - `satisfies DemandResponse` on GET responses

requirements-completed: [DEMA-01, DEMA-02, DEMA-03]

duration: —
completed: 2026-04-07
---

# Phase 06: Demand API — Plan 02 Summary

**Worker routes for demand registration, relay polling, and relay status reporting with KV persistence.**

## Accomplishments

- Demand endpoint: public POST with throttle; authenticated GET returning `DemandResponse` and configurable window
- Relay status POST: validates JSON shape, any string `state`, `expirationTtl: 120`

## Self-Check: PASSED

- Files exist; `bun check` and `bun lint` clean
