---
phase: 09-relay-deployment
plan: 01
subsystem: infra
tags: [raspberry-pi, systemd, tailscale, relay, provisioning]
requires:
  - phase: 07-relay-service
    provides: relay runtime service and env-based config
provides:
  - One-time Pi provisioning script for relay host bootstrap
  - Hardened relay systemd service with restart policy
  - Timer-based failure counter reset for eventual recovery
affects: [09-02-deploy-pipeline, relay-operations]
tech-stack:
  added: []
  patterns: [boot-env secret handoff, hardened systemd service, sparse checkout deploy footprint]
key-files:
  created:
    - packages/relay/config/river-relay.service
    - packages/relay/config/river-relay-reset.timer
    - packages/relay/config/river-relay-reset.service
    - packages/relay/scripts/setup.sh
  modified:
    - packages/relay/.env.example
key-decisions:
  - "Set systemd restart guard to StartLimitBurst=10 within 300s and reset every 15m for eventual autonomous recovery."
  - "Install Bun to /usr/local/bin/bun during provisioning so systemd ExecStart path is stable."
patterns-established:
  - "Provisioning script is root-only, first-boot focused, and idempotent where safe."
  - "Secrets move from boot partition to /opt/river-relay/.env with chmod 600 and boot copy removal."
requirements-completed: [DEPL-01, DEPL-02, DEPL-03, DEPL-04, DEPL-05, DEPL-07]
duration: 1 min
completed: 2026-04-08
---

# Phase 09 Plan 01: Pi provisioning and systemd bootstrap Summary

**Pi bootstrap now installs relay dependencies, hardens storage writes, wires Tailscale access, and runs relay via hardened systemd with periodic failure-counter reset.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-08T09:02:20Z
- **Completed:** 2026-04-08T09:04:19Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added relay systemd unit, reset timer, and reset oneshot under `packages/relay/config`.
- Added first-boot `setup.sh` provisioning flow for Bun/ffmpeg/Tailscale/user creation/repo setup/systemd enable/start.
- Updated relay env template with `TAILSCALE_AUTHKEY` for setup-time auth.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create systemd service, timer, and reset units** - `ab8de66` (feat)
2. **Task 2: Create setup.sh provisioning script and update .env.example** - `291bd48` (feat)

## Files Created/Modified
- `packages/relay/config/river-relay.service` - Hardened relay service unit with restart policy and env file.
- `packages/relay/config/river-relay-reset.timer` - 15-minute timer for reset job.
- `packages/relay/config/river-relay-reset.service` - Oneshot `systemctl reset-failed` runner.
- `packages/relay/scripts/setup.sh` - Root bootstrap script for full Pi provisioning.
- `packages/relay/.env.example` - Added `TAILSCALE_AUTHKEY` deployment secret.

## Decisions Made
- Used `StartLimitBurst=10` and `StartLimitIntervalSec=300` with a 15-minute reset timer to avoid permanent dead-stop after burst failures.
- Kept `.env` parsing text-based (`awk`/`sed`) instead of sourcing to avoid executing arbitrary shell content from boot media.

## Deviations from Plan

None - plan executed exactly as written.

---

**Total deviations:** 0 auto-fixed (0 bug, 0 missing critical, 0 blocking)
**Impact on plan:** None.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for `09-02-PLAN.md` (idempotent configure/deploy pipeline and docs).
- No blockers from this plan.

## Self-Check: PASSED

---
*Phase: 09-relay-deployment*
*Completed: 2026-04-08*
