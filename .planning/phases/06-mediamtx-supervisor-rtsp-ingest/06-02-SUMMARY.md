---
phase: 06-mediamtx-supervisor-rtsp-ingest
plan: 02
subsystem: stream
tags: [mediamtx, supervisor, child_process, backoff, watchdog, h264, pino]

requires:
  - phase: 06-mediamtx-supervisor-rtsp-ingest
    provides: config.ts, mediamtx-config.ts, mediamtx-api.ts (Plan 01)
provides:
  - Supervisor class — spawn, poll, codec guard, stall watchdog, backoff, graceful shutdown
affects:
  - 06-03 wiring (createApp getStatus)

tech-stack:
  added: []
  patterns:
    - Discriminated-union internal State mapped to HealthStatus via getStatus()
    - Line-buffered child stdout/stderr into Pino child logger (component mediamtx)

key-files:
  created:
    - packages/stream/src/supervisor.ts
  modified: []

key-decisions:
  - "Constructor uses explicit readonly fields + body assignment instead of parameter properties — required for TS erasableSyntaxOnly in @traskriver/stream"

patterns-established:
  - "intentionalStop set before killChild so exit handler does not scheduleRestart during shutdown"
  - "killChild: SIGTERM then 10s timer then SIGKILL; exit clears timer"

requirements-completed: [STRM-02, STRM-03, STRM-04, STRM-05]

duration: 5min
completed: 2026-04-21
---

# Phase 06 Plan 02: Supervisor (MediaMTX lifecycle) Summary

**Single `Supervisor` class owns MediaMTX child spawn, API polling, H264 codec fatal guard, 75s stall restart, exponential backoff with 60s clean-uptime reset, and SIGTERM→10s→SIGKILL teardown.**

## State machine kinds

| kind | Role |
| ---- | ---- |
| `idle` | Initial |
| `spawning` | Child process starting / scheduled restart pending |
| `waitingReady` | Running; path not ready or reconnecting |
| `ready` | Path ready; tracks bytes + stall counter |
| `stalled` | Stall threshold hit; kill + reschedule |
| `shuttingDown` | User shutdown |
| `fatal` | Codec mismatch (before `process.exit(1)`) |

## Locked constants (file top)

- `POLL_INTERVAL_MS = 5_000`
- `STALL_THRESHOLD_POLLS = 15` (75s at 5s interval)
- `BACKOFF_INITIAL_MS = 1_000` → doubles to cap `BACKOFF_MAX_MS = 30_000`
- `CLEAN_UPTIME_MS = 60_000` — backoff reset after clean ready period
- `SIGTERM_GRACE_MS = 10_000` — then SIGKILL
- `CODEC_EXPECTED = 'H264'`

## intentionalStop

Set `true` at the start of `shutdown()` before `killChild()`. The child `exit` handler skips `scheduleRestart()` when `intentionalStop` or state is `shuttingDown`, so a deliberate SIGTERM does not enter the backoff respawn loop.

## killChild escalation

Send SIGTERM; register `once('exit')` to resolve and clear a 10s timer; if timer fires first, log and SIGKILL. Both kills wrapped in try/catch.

## State → HealthStatus mapping

| Internal state | getStatus() |
| -------------- | ----------- |
| idle, spawning, waitingReady | starting |
| ready | ready |
| stalled, shuttingDown, fatal | degraded |

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-21T01:25:20Z
- **Completed:** 2026-04-21T01:26:30Z
- **Tasks:** 1
- **Files modified:** 1 created

## Accomplishments

- `packages/stream/src/supervisor.ts` — full lifecycle per plan (stdio, backoff, poll, codec, stall, SIGTERM/SIGKILL)
- `bun run --filter=@traskriver/stream check` passes

## Task Commits

1. **Task 1: Author supervisor.ts (full class)** — `98c3934` (feat)

**Plan metadata:** `daef7d2` (docs: complete plan)

## Files Created/Modified

- `packages/stream/src/supervisor.ts` — `Supervisor` with `start`, `shutdown`, `getStatus`

## Decisions Made

- Replaced TypeScript parameter-property constructor with explicit `readonly` fields assigned in the constructor body so the package compiles under `erasableSyntaxOnly` (Rule 3 — blocking).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Constructor form for erasableSyntaxOnly**

- **Found during:** Task 1
- **Issue:** `private readonly cfg` / `log` parameter properties rejected by TS1294 with `erasableSyntaxOnly`
- **Fix:** Declare `private readonly cfg` and `log` as class fields; assign in `constructor(cfg, log) { ... }`
- **Files modified:** `packages/stream/src/supervisor.ts`
- **Verification:** `bun run --filter=@traskriver/stream check` passes
- **Committed in:** `98c3934`

---

**Total deviations:** 1 auto-fixed (blocking)
**Impact on plan:** Behavior unchanged; only constructor syntax differs from plan snippet.

## Issues Encountered

None beyond the TS compiler constraint above.

## User Setup Required

None.

## Next Phase Readiness

Plan 03 can `new Supervisor(config, log.child({ component: 'supervisor' }))` and pass `getStatus` into `createApp`.

---
*Phase: 06-mediamtx-supervisor-rtsp-ingest*
*Completed: 2026-04-21*

## Self-Check: PASSED

- `packages/stream/src/supervisor.ts` exists
- Commit `98c3934` present in history
