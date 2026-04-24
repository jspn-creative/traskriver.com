---
phase: 06-mediamtx-supervisor-rtsp-ingest
plan: 03
subsystem: infra
tags: [hono, mediamtx, supervisor, health, node-server]

requires:
  - phase: 06-mediamtx-supervisor-rtsp-ingest
    provides: Supervisor class, HealthStatus type, foundation modules
provides:
  - createApp({ getStatus }) with live /health status from supervisor
  - Boot order loadConfig → logger → Supervisor (construct) → createApp → serve → void supervisor.start
  - Shutdown order await supervisor.shutdown then server.close; spawn failure exits 1
affects:
  - 06-04 verification
  - Phase 7 /health payload expansion

tech-stack:
  added: []
  patterns:
    - Dependency injection of getStatus via closure (no module singleton for health)
    - HTTP listens before MediaMTX spawn completes; supervisor failure is process-fatal

key-files:
  created: []
  modified:
    - packages/stream/src/server.ts
    - packages/stream/src/index.ts

key-decisions:
  - "Supervisor shutdown runs before server.close so /health stays meaningful during MediaMTX teardown"

patterns-established:
  - "createApp(opts) receives getStatus: () => HealthStatus; handler calls it per request"
  - "Phase 7 may add JSON keys; Phase 6 only changes the source of status string"

requirements-completed: [STRM-02]

duration: 1min
completed: 2026-04-21
---

# Phase 06 Plan 03: Supervisor HTTP wiring Summary

**Live `/health` via `createApp({ getStatus })` closure; boot serves HTTP then starts MediaMTX; shutdown tears down supervisor before Hono closes**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-21 (executor session)
- **Completed:** 2026-04-21 (executor session)
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `createApp` takes `getStatus`; `GET /health` returns `{ status: opts.getStatus() }` with `Cache-Control: no-store` (payload shape unchanged for Phase 7 forward-compat).
- `index.ts` constructs `Supervisor` after logger, passes `() => supervisor.getStatus()` into `createApp`, calls `serve`, then `void supervisor.start().catch(→ exit 1)`.
- SIGTERM/SIGINT: `await supervisor.shutdown()` first, then `server.close` → `process.exit(0)`; errors during supervisor shutdown are logged but server still closes.

## Task Commits

1. **Task 1: Update server.ts — createApp accepts getStatus accessor** — `a2fc5a2` (feat)
2. **Task 2: Update index.ts — wire Supervisor into boot + shutdown** — `69a674c` (feat)

**Plan metadata:** same commit as this SUMMARY (`docs(06-03): complete Supervisor HTTP wiring plan`)

## Files Created/Modified

- `packages/stream/src/server.ts` — `createApp(opts: { getStatus: () => HealthStatus })`, per-request status read
- `packages/stream/src/index.ts` — Supervisor lifecycle integrated with Hono boot/shutdown ordering

## Decisions Made

- Followed plan verbatim: supervisor-first shutdown keeps ops `/health` coherent during MediaMTX teardown; no globals (supervisor is a `const` at module scope).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

- Plan 04 can run build/`node --check` verification; Phase 7 can widen `/health` JSON while keeping the same injection pattern for `status`.

---

_Phase: 06-mediamtx-supervisor-rtsp-ingest_

_Completed: 2026-04-21_

## Self-Check: PASSED

- `06-03-SUMMARY.md` exists at `.planning/phases/06-mediamtx-supervisor-rtsp-ingest/06-03-SUMMARY.md`
- Task commits `a2fc5a2`, `69a674c` and docs commit `docs(06-03): complete Supervisor HTTP wiring plan` present in `git log`
