---
phase: 03-river-conditions-data
plan: '01'
subsystem: ui
tags: [svelte, usgs, open-meteo, tailwind]
requires:
  - phase: 02-sidebar-content-overhaul
    provides: LocalWeather pattern and sidebar context
provides:
  - USGS gauge RiverConditions (flow, temp, relative freshness)
  - Fish run lookup and FishRunStatus UI
  - Sunrise/sunset in LocalWeather via Open-Meteo daily
affects: [03-02]
tech-stack:
  added: []
  patterns:
    - 'Client fetch in $effect; parse USGS JSON by parameterCd, not array index'
key-files:
  created:
    - packages/web/src/lib/data/fish-runs.ts
    - packages/web/src/lib/components/RiverConditions.svelte
    - packages/web/src/lib/components/FishRunStatus.svelte
  modified:
    - packages/web/src/lib/components/LocalWeather.svelte
key-decisions:
  - 'Latest USGS timestamp taken as max of discharge vs temperature sample times when both present'
patterns-established:
  - 'River telemetry matches LocalWeather fly transition and label/value typography'
requirements-completed: [RIVR-01, RIVR-02, RIVR-03, RIVR-04]
duration: 8 min
completed: '2026-04-10'
---

# Phase 03 Plan 01: River conditions data components Summary

**USGS instantaneous gauge 14302480 (cfs + °F with relative freshness), static Trask fish-run seasons with peak badges, and Open-Meteo sunrise/sunset in the weather card.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-10T00:00:00Z
- **Completed:** 2026-04-10T00:08:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `fish-runs.ts` with `getCurrentFishRuns()` for Tillamook/Trask seasonal timing
- `RiverConditions.svelte` client-fetches NWIS IV JSON and maps `00060`/`00010` by code
- `FishRunStatus.svelte` lists active runs with optional Peak badge
- `LocalWeather.svelte` extended with `daily=sunrise,sunset` and formatted local times

## Task Commits

1. **Task 1: Create fish-runs data module and RiverConditions component** — `995bfd1` (feat)
2. **Task 2: Extend LocalWeather with sunrise/sunset and create FishRunStatus** — `37cfa79` (feat)

## Files Created/Modified

- `packages/web/src/lib/data/fish-runs.ts` — Trask fish run table and `getCurrentFishRuns`
- `packages/web/src/lib/components/RiverConditions.svelte` — USGS fetch, loading/error/offline, freshness
- `packages/web/src/lib/components/FishRunStatus.svelte` — In-season list with peak badges
- `packages/web/src/lib/components/LocalWeather.svelte` — Sunrise/sunset row in weather grid

## Decisions Made

None beyond plan — followed specified APIs and layout.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 03-02: wire `RiverConditions` and `FishRunStatus` into sidebar and remove `TelemetryFooter`.

---

_Phase: 03-river-conditions-data_

---

## Self-Check: PASSED

- Key files from `key-files.created` exist on disk
- `git log --oneline --all --grep="03-01"` shows task commits
