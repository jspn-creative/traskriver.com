---
phase: 09-relay-deployment
plan: 02
subsystem: infra
tags: [relay, systemd, tailscale, github-actions, deployment]
requires:
  - phase: 09-01
    provides: Pi provisioning script, systemd units, baseline relay deployment layout
provides:
  - Idempotent relay deploy/config script (`configure.ts`)
  - GitHub Actions deployment workflow over Tailscale SSH
  - Relay operations runbook with rollback procedure
affects: [relay-operations, ci-cd, deployment]
tech-stack:
  added: []
  patterns: [ff-only deploy pull, lockfile-aware install, diff-based unit sync, tailscale ci ssh]
key-files:
  created:
    - .github/workflows/deploy-relay.yml
    - packages/relay/scripts/configure.ts
  modified:
    - packages/relay/README.md
key-decisions:
  - "Use ff-only git pull and content-diffed systemd unit sync for idempotent re-runs."
  - "Trigger deploy only on relay/shared paths to avoid unnecessary Pi deployments."
patterns-established:
  - "Deploy script performs preflight checks, code update, conditional install, unit sync, restart, and health verification."
  - "CI deploy reaches relay over Tailscale with OAuth credentials and hostname secret."
requirements-completed: [DEPL-06, DEPL-08, DEPL-09]
duration: 2min
completed: 2026-04-08
---

# Phase 09 Plan 02: Relay Deployment Summary

**Idempotent Pi deploy automation via `configure.ts`, path-filtered Tailscale GitHub Actions deploy, and documented rollback operations for relay service management.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-08T09:06:08Z
- **Completed:** 2026-04-08T09:07:54Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `packages/relay/scripts/configure.ts` for safe repeatable deploy/update runs on Pi.
- Added `.github/workflows/deploy-relay.yml` for main-branch relay/shared path-filtered deployments.
- Expanded `packages/relay/README.md` with setup, deployment, rollback, operations, secrets, and Tailscale ACL example.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create idempotent configure.ts deploy script** - `2dd1532` (feat)
2. **Task 2: Create GitHub Actions deploy workflow and relay README** - `a107958` (feat)

**Plan metadata:** pending final docs commit

## Files Created/Modified
- `packages/relay/scripts/configure.ts` - idempotent relay deploy/config script with preflight, update, restart, rollback fallback, and health check.
- `.github/workflows/deploy-relay.yml` - deploy workflow over Tailscale SSH, filtered to relay/shared changes on `main`.
- `packages/relay/README.md` - relay runbook: initial setup, auto/manual deploy, rollback, operations, and secrets.

## Decisions Made
- Use `git pull --ff-only` plus lockfile-aware dependency install in deploy script.
- Copy systemd units only when file contents differ; daemon-reload only when needed.
- Keep deployment trigger scoped to relay/shared paths.

## Deviations from Plan

None - plan executed exactly as written.

---

**Total deviations:** 0 auto-fixed (0)
**Impact on plan:** None.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Relay deployment automation is in place for operator and CI paths.
- No blocker identified for phase completion.

## Self-Check: PASSED
- FOUND: `.planning/phases/09-relay-deployment/09-02-SUMMARY.md`
- FOUND: `2dd1532`
- FOUND: `a107958`

---
*Phase: 09-relay-deployment*
*Completed: 2026-04-08*
