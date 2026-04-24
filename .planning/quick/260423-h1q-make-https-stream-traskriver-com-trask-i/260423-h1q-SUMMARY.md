---
phase: quick-260423-h1q-make-https-stream-traskriver-com-trask-i
plan: 01
subsystem: infra
tags: [openlitespeed, xcloud, hls, deploy, reverse-proxy]
requires: []
provides:
  - Idempotent OLS `/trask/` proxy route provisioning script with drift checks.
  - Deploy orchestration hook that applies route config and reloads OLS only when needed.
  - Curl-based smoke verification for local upstream and public HTTPS HLS manifests.
affects: [stream-deploy, stream-routing, public-hls]
tech-stack:
  added: []
  patterns: [marker-managed config blocks, conditional service reloads, actionable smoke checks]
key-files:
  created:
    - scripts/configure-stream-ols-route.sh
    - scripts/verify-stream-route.sh
  modified:
    - scripts/deploy-stream.sh
key-decisions:
  - 'Manage `/trask/` route in vhost config using begin/end markers for idempotent updates.'
  - 'Only reload OpenLiteSpeed when route config changes; fallback to restart on reload failure.'
patterns-established:
  - 'Deploy step enforces route provisioning before declaring success.'
  - 'Route verification checks both HTTP status and HLS manifest signature.'
requirements-completed: [QUICK-HTTPS-STREAM-01]
duration: 2m
completed: 2026-04-23
---

# Phase [quick-260423-h1q] Plan [01]: make-https-stream-traskriver-com-trask-i Summary

**OLS `/trask/*` routing now deploys idempotently to `127.0.0.1:8088` with conditional server reload and manifest smoke verification.**

## Performance

- **Duration:** 2m
- **Started:** 2026-04-23T19:19:31Z
- **Completed:** 2026-04-23T19:21:02Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added `scripts/configure-stream-ols-route.sh` with `--apply` and `--check` modes, fail-fast path validation, and idempotent marker-managed config writes.
- Updated `scripts/deploy-stream.sh` to run route provisioning and reload/restart OpenLiteSpeed only when route config changed.
- Added `scripts/verify-stream-route.sh` to validate both local and public manifest endpoints for `200` + `#EXTM3U`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add idempotent OLS/xCloud route provisioning for `/trask/*`** - `f01bda2` (feat)
2. **Task 2: Wire routing setup into stream deployment flow** - `d487ea7` (feat)
3. **Task 3: Add public-route smoke verification script** - `15ef05c` (feat)

## Files Created/Modified

- `scripts/configure-stream-ols-route.sh` - OLS route provision/check script with idempotent managed block updates.
- `scripts/deploy-stream.sh` - deploy hook for route apply + conditional OLS reload/restart behavior.
- `scripts/verify-stream-route.sh` - curl smoke checks for upstream/public HLS manifest validity.

## Decisions Made

- Used marker-managed block replacement inside vhost config to guarantee idempotency across repeated deploy runs.
- Treated OLS reload as conditional side effect based on `ROUTE_CONFIG_CHANGED`, with restart fallback to keep deploy failure explicit and deterministic.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Full in-repo `bash scripts/deploy-stream.sh` verification is environment-dependent (`XCLOUD_SITE_PATH` and `/var/www/stream.traskriver.com` paths); validation was performed with syntax checks and focused script-level smoke tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Stream deploy now enforces route setup and has dedicated route smoke checks.
- Ready for remote run on target host to confirm public `https://stream.traskriver.com/trask/index.m3u8` returns live `#EXTM3U`.

## Self-Check: PASSED

- Found `scripts/configure-stream-ols-route.sh`
- Found `scripts/verify-stream-route.sh`
- Found commit `f01bda2`
- Found commit `d487ea7`
- Found commit `15ef05c`
