---
phase: 05-packages-stream-skeleton
plan: 03
subsystem: testing
tags: [turbo, tsc, node, hono, smoke-test, zod]

requires:
  - phase: 05-packages-stream-skeleton
    provides: packages/stream scaffold + src from plans 01–02
provides:
  - Verified clean build emit, node --check, /health smoke, SIGTERM exit 0, invalid PORT fail-fast
  - Recorded verbatim command output for STRM-01 closure
affects:
  - phase 06 planning (supervisor attaches to this HTTP surface)

tech-stack:
  added: []
  patterns:
    - 'Smoke verification run with bash (zsh + set -e + failing command substitution is unsafe for fail-fast capture)'

key-files:
  created:
    - .planning/phases/05-packages-stream-skeleton/05-03-SUMMARY.md
  modified:
    - .planning/phases/05-packages-stream-skeleton/05-01-SUMMARY.md (Prettier only)

key-decisions:
  - 'Emit uses double-quoted relative import specifiers in dist/index.js; semantic check uses grep for ./config.js substring'

patterns-established: []

requirements-completed: [STRM-01]

duration: 18min
completed: 2026-04-20
---

# Phase 5 Plan 3: Build, smoke, and repo check Summary

**Verified `@traskriver/stream` tsc emit, `node --check`, `/health` JSON + headers, graceful SIGTERM (exit 0), and zod fail-fast on invalid PORT — repo-wide `bun run check` green.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-20T23:35:00Z
- **Completed:** 2026-04-20T23:53:00Z
- **Tasks:** 3
- **Files modified:** 2 (this SUMMARY, Prettier on `05-01-SUMMARY.md`)

## Accomplishments

- Clean `turbo` build for `@traskriver/stream`; `dist/{index,config,logger,server}.js` + source maps present
- `node --check packages/stream/dist/index.js` exit 0
- Smoke: HTTP 200 `/health` body `{"status":"starting"}`; `Content-Type: application/json`; `Cache-Control: no-store`; unknown path 404; SIGTERM → wait exit 0
- Fail-fast: `PORT=not-a-number` → exit 1, stderr `FATAL: invalid env` + zod diagnostic
- `bun run format` + `bun run check` (turbo) exit 0; `bunx prettier --check packages/stream/` exit 0

## Task Commits

Verification-only Tasks 1–2 introduced no code changes (no commits).

1. **Task 1: Build and node --check the emit** — verification only (no commit)
2. **Task 2: Smoke-boot + shutdown + fail-fast** — verification only (no commit; script run under **bash** — see Deviations)
3. **Task 3: Prettier + repo-wide check + phase close** — `c4791a8` (summaries + `05-01` Prettier), `dab0ced` (STATE + ROADMAP)

**Plan metadata:** `c4791a8`, `dab0ced`

## Task 1 — Build / emit / node --check

Commands (repo root):

```text
$ rm -rf packages/stream/dist && bun run build --filter=@traskriver/stream
• turbo 2.9.5 — @traskriver/stream:build: $ tsc — Tasks: 1 successful
BUILD_EXIT:0
$ node --check packages/stream/dist/index.js
NODE_CHECK_EXIT:0
```

Emitted `packages/stream/dist/index.js` import line (rewrite verified):

```text
import { loadConfig } from "./config.js";
```

`grep -rE "from ['\"]\\./[a-z]+\\.ts['\"]" packages/stream/dist/*.js` — no matches.

`test -f packages/stream/dist/index.js.map` — exit 0.

## Task 2 — Smoke capture (bash)

```text
=== SMOKE CAPTURE ===
BODY: {"status":"starting"}
HEADERS:
HTTP/1.1 200 OK
cache-control: no-store
content-type: application/json
Date: Mon, 20 Apr 2026 23:43:38 GMT
Connection: keep-alive
Keep-Alive: timeout=5

UNKNOWN_PATH_HTTP: 404
SIGTERM_WAIT_EXIT: 0
FAILFAST_RC: 1
FAILFAST_STDERR:
FATAL: invalid env:
✖ Invalid input: expected number, received NaN
  → at PORT
```

(Pino listening/shutdown lines appeared on stderr during happy-path run; captured separately in terminal.)

## Task 3 — Quality gate

```text
$ bun run check
turbo run check — 4 packages — Tasks: 4 successful (FULL TURBO)
```

## Files Created/Modified

- `05-03-SUMMARY.md` — this artifact
- `05-01-SUMMARY.md` — Prettier reformat from `bun run format`

## Decisions Made

- None beyond documenting emit quote style and bash for orchestrated smoke (see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan grep for single-quoted `from './config.js'` does not match tsc emit**

- **Found during:** Task 1 (emit verification)
- **Issue:** `dist/index.js` uses `from "./config.js"` (double quotes); plan’s `grep -q "from './config.js'"` fails though rewrite is correct.
- **Fix:** Verified rewrite with `grep -E 'from ["'\'']./config.js'` / substring `./config.js` in import line.
- **Files modified:** None (verification note only).
- **Verification:** Imports resolve at runtime; smoke test passed.
- **Committed in:** N/A

**2. [Rule 3 - Blocking] zsh `set -e` + `OUT=$(node …)` exits before reading `$?` when node returns 1**

- **Found during:** Task 2 (fail-fast smoke)
- **Issue:** Plan’s inline script fails under zsh after `SMOKE 1+2 PASSED` when capturing fail-fast stderr.
- **Fix:** Ran the orchestrated smoke block with `bash -c '…'` (plan’s script is bash-oriented).
- **Files modified:** None.
- **Verification:** `FAILFAST_RC=1` and stderr match acceptance criteria.
- **Committed in:** N/A

---

**Total deviations:** 2 documented (1 emit/grep mismatch, 1 shell errexit). **Impact:** No source changes; verification outcomes meet STRM-01 truths.

## Issues Encountered

None — after switching fail-fast capture to bash.

## User Setup Required

None.

## Next Phase Readiness

- `packages/stream` skeleton verified; ready for Phase 6 (MediaMTX supervisor) per ROADMAP.
- STRM-01 closed.

---

## Self-Check: PASSED

- Key file `05-03-SUMMARY.md` exists
- `git log --oneline --all --grep="05-03"` returns ≥1 commit after docs commits land

---

_Phase: 05-packages-stream-skeleton_
_Completed: 2026-04-20_
