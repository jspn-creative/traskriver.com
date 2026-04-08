---
phase: 08-stream-ux
plan: 01
subsystem: api
tags: [sveltekit, cloudflare-kv, relay-status, shared-types]
requires:
  - phase: 06-demand-api
    provides: relay status KV key and worker endpoint patterns
  - phase: 07-relay-service
    provides: relay status writes to KV heartbeat
provides:
  - public GET /api/relay/status for web polling
  - shared RelayStatusResponse contract for API/page typing
  - shared stale/ttl relay status constants
affects: [08-02 page polling state machine, stream-ux]
tech-stack:
  added: []
  patterns: [shared constants as single source of truth, public read/private write split for relay status]
key-files:
  created: [.planning/phases/08-stream-ux/08-01-SUMMARY.md]
  modified: [packages/shared/index.ts, packages/web/src/routes/api/relay/status/+server.ts]
key-decisions:
  - "Keep GET /api/relay/status public while preserving bearer auth on POST writes"
  - "Use @river-stream/shared constants for status TTL/stale logic to avoid duplicated magic numbers"
patterns-established:
  - "Relay status endpoints split by trust boundary: public GET for viewers, bearer-protected POST for relay"
  - "KV missing/invalid status payload returns null-state stale response instead of throwing"
requirements-completed: [STRX-01, STRX-03]
duration: 1m
completed: 2026-04-08
---

# Phase 08 Plan 01: Relay Status Read API Summary

**Public relay-status GET endpoint now returns typed state/timestamp/stale from KV using shared response contract and stale-threshold constants.**

## Performance

- **Duration:** 1m
- **Started:** 2026-04-08T15:36:20Z
- **Completed:** 2026-04-08T15:36:49Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `RelayStatusResponse` to shared package with null-safe fields for absent relay heartbeat.
- Exported `RELAY_STATUS_TTL_SECONDS` and `RELAY_STATUS_STALE_THRESHOLD_MS` from shared package.
- Added public `GET /api/relay/status` that reads KV and returns stale/null-state fallback on missing or invalid payload.
- Kept `POST /api/relay/status` auth/write behavior intact while switching TTL source to shared constant.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add RelayStatusResponse type to shared package** - `3c4a950` (feat)
2. **Task 2: Add public GET handler to relay status endpoint** - `9a60425` (feat)

## Files Created/Modified
- `packages/shared/index.ts` - added `RelayStatusResponse` and relay status ttl/stale constants.
- `packages/web/src/routes/api/relay/status/+server.ts` - added public `GET` handler and imported shared constants/types for both GET and POST paths.

## Decisions Made
- Added runtime relay-state validation in GET response (`idle|starting|live|stopped`) before returning typed state.
- Missing/invalid KV value resolves to `{ state: null, timestamp: null, stale: true }` to keep frontend polling resilient.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 02 can consume `RelayStatusResponse` directly in polling logic.
- Relay stale/unavailable detection now has shared constants and endpoint support in place.

---
*Phase: 08-stream-ux*
*Completed: 2026-04-08*

## Self-Check: PASSED

- FOUND: `.planning/phases/08-stream-ux/08-01-SUMMARY.md`
- FOUND commit: `3c4a950`
- FOUND commit: `9a60425`
