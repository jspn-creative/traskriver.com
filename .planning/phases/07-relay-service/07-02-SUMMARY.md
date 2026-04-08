---
phase: 07-relay-service
plan: 02
subsystem: infra
tags: [relay, ffmpeg, bun, health, tailscale, polling]
requires:
  - phase: 07-relay-service
    provides: Plan 01 relay modules (state machine, poller, status reporter, logger)
provides:
  - FfmpegManager with Bun.spawn, stderr tail ring buffer, SIGTERM/SIGKILL stop, onExit hooks
  - Optional Bun.serve /health JSON snapshot for remote ops (Tailscale-friendly bind)
  - End-to-end relay main loop with live confirm debounce, cooldown recovery, safety stop on poll failures
  - packages/relay/.env.example documenting required and optional env vars
affects: [08-stream-ux, 09-relay-deployment, relay-runtime]
tech-stack:
  added: []
  patterns: [setTimeout-chained poll tick, intentional-stop flag to suppress benign ffmpeg error logs]
key-files:
  created:
    - packages/relay/src/ffmpeg.ts
    - packages/relay/src/health-server.ts
    - packages/relay/.env.example
  modified:
    - packages/relay/src/index.ts
    - packages/relay/src/state-machine.ts
    - packages/relay/.gitignore
key-decisions:
  - "Allow starting→stopping so demand expiry can use the same stopping→idle path as live"
  - "Negate .env.example in relay .gitignore so the example file is versioned"
patterns-established:
  - "FfmpegManager retains last 30 stderr lines (cap 4096 chars) and logs tail on non-zero exit when stop was not intentional"
requirements-completed: [RLAY-01, RLAY-02, RLAY-03, RLAY-04, RLAY-05, RLAY-06]
duration: 12min
completed: 2026-04-07
---

# Phase 7 Plan 2: Relay Service Summary

**Full relay runtime: demand polling loop, ffmpeg RTSP→FLV with stderr diagnostics, Bun /health for operators, crash recovery via valid FSM paths and cooldown, and graceful shutdown.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-07T18:00:00Z
- **Completed:** 2026-04-07T18:12:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Implemented `FfmpegManager` with stderr consumption, optional verbose logging, and controlled teardown with SIGTERM plus 10s SIGKILL fallback.
- Shipped `startHealthServer` exposing `GET /health` JSON from the live state machine snapshot.
- Replaced relay entrypoint with setTimeout-chained polling, live confirmation window, safety stop on consecutive poll failures, and status reporting mapped from internal to public states.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ffmpeg process manager with crash detection and stderr diagnostics** - `14871a4` (feat)
2. **Task 2: Health HTTP server, main loop, env docs (Tailscale-ready)** - `5c64f6e` (feat)

**Plan metadata:** `docs(07-02): complete relay service plan` (STATE.md, ROADMAP.md, REQUIREMENTS.md)

## Files Created/Modified

- `packages/relay/src/ffmpeg.ts` — Subprocess lifecycle, stderr ring buffer, exit callbacks.
- `packages/relay/src/health-server.ts` — Bun.serve health endpoint; returns JSON snapshot.
- `packages/relay/src/index.ts` — Config validation, main tick loop, shutdown handlers.
- `packages/relay/src/state-machine.ts` — Added `starting` → `stopping` for demand expiry while still in `starting`.
- `packages/relay/.env.example` — Documented URLs, tuning knobs, health and verbose ffmpeg flags.
- `packages/relay/.gitignore` — `!.env.example` so the example file is tracked.

## Decisions Made

- Extended the Plan 01 transition map so `starting` may enter `stopping`, matching the planned “demand expired” path while ffmpeg is still coming up.
- Adjusted relay package ignore rules so `.env.example` is not matched by `.env.*`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] FSM rejected starting→stopping for demand expiry**

- **Found during:** Task 2 (main loop wiring)
- **Issue:** Plan 01 allowed only `starting` → `live` | `cooldown`, but Plan 02 main loop transitions to `stopping` when demand drops in `starting`.
- **Fix:** Added `stopping` to the allowed targets from `starting` in `validTransitions`.
- **Files modified:** `packages/relay/src/state-machine.ts`
- **Verification:** `bun check` clean; transitions align with plan acceptance criteria.
- **Committed in:** `5c64f6e` (Task 2 commit)

**2. [Rule 3 - Blocking] `.env.example` could not be committed**

- **Found during:** Task 2 (env documentation)
- **Issue:** `packages/relay/.gitignore` used `.env.*`, which ignored `.env.example`.
- **Fix:** Added `!.env.example` after `.env.*`.
- **Files modified:** `packages/relay/.gitignore`
- **Verification:** `git add packages/relay/.env.example` succeeds; file tracked.
- **Committed in:** `5c64f6e` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both blocking)
**Impact on plan:** Required for versioned env template and valid FSM behavior; no product scope change.

## Issues Encountered

None beyond the deviations above.

## User Setup Required

None — configure real `STREAM_URL`, `RTSP_URL`, `RELAY_BEARER_TOKEN`, and API URLs in deployment `.env` per `.env.example`.

## Next Phase Readiness

- Relay package type-checks and bundles; ready for Stream UX alignment and deployment/systemd work in later phases.

## Self-Check: PASSED

- Confirmed on disk: `packages/relay/src/ffmpeg.ts`, `health-server.ts`, `index.ts`, `state-machine.ts`, `packages/relay/.env.example`.
- `git rev-parse --verify 14871a4^{commit}` and `5c64f6e^{commit}` succeed.

---
*Phase: 07-relay-service*
*Completed: 2026-04-07*
