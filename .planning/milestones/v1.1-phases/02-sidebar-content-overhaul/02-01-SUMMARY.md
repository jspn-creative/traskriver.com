---
phase: 02-sidebar-content-overhaul
plan: 01
subsystem: ui
tags: [svelte-5, tailwind-v4, sidebar, open-meteo]

requires:
  - phase: 01-analytics-integration
    provides: Counterscale layout shell unchanged; sidebar lives in same +page shell
provides:
  - Always-visible sidebar with Trask River branding, LocalWeather, TelemetryFooter, sticky stream CTA
  - PassDetailsPanel removed; stream button + labels inlined in +page.svelte
affects:
  - 03-river-conditions-data

tech-stack:
  added: []
  patterns:
    - 'Sticky bottom CTA in drawer with phase-based restart vs registerDemand'
    - 'Plain-English weather copy (Open-Meteo attribution)'

key-files:
  created: []
  modified:
    - packages/web/src/lib/components/LocalWeather.svelte
    - packages/web/src/routes/+page.svelte
  deleted:
    - packages/web/src/lib/components/PassDetailsPanel.svelte

key-decisions:
  - 'Viewing/live CTA label uses Streaming (D-07) vs legacy Stream active'
  - 'Mobile drawer trigger copy View Pass → Stream Info'

patterns-established:
  - 'Sidebar content is a single scroll column + sticky footer CTA (no phase-based swap)'

requirements-completed:
  - SIDE-01
  - SIDE-02
  - SIDE-03
  - SIDE-04

duration: 25min
completed: 2026-04-10
---

# Phase 02: Sidebar & Content Overhaul — Plan 01

**Static stacked sidebar with river branding, hourly Open-Meteo weather, and sticky stream control; product-page panel removed and copy de-jargoned.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2
- **Files modified:** 2 (+ 1 deleted)

## Accomplishments

- LocalWeather headings and footer copy aligned with D-12 (Current Weather, Weather Data Live, Open-Meteo attribution)
- Drawer sidebar always shows branding, weather, telemetry placeholder, and sticky stream button; `PassDetailsPanel` deleted
- Mobile FAB label updated to Stream Info

## Task Commits

1. **Task 1: LocalWeather copy (D-12)** — `345aa74`
2. **Task 2: Sidebar layout + delete PassDetailsPanel** — `fce78e0`

## Files Created/Modified

- `packages/web/src/lib/components/LocalWeather.svelte` — copy only; fetch unchanged
- `packages/web/src/routes/+page.svelte` — sidebar layout, CTA state, imports
- `packages/web/src/lib/components/PassDetailsPanel.svelte` — removed

## Decisions Made

- Followed PLAN markup for CTA `onclick` (restart vs registerDemand) and Streaming label for live/viewing

## Deviations from Plan

None — plan executed as written.

## Issues Encountered

Prettier on `+page.svelte` after manual paste; resolved with `bun format`.

## User Setup Required

None.

## Next Phase Readiness

Sidebar ready for river-conditions / telemetry content in Phase 3.

---

_Phase: 02-sidebar-content-overhaul · Completed: 2026-04-10_

## Self-Check: PASSED

- `packages/web/src/routes/+page.svelte` exists
- `packages/web/src/lib/components/LocalWeather.svelte` exists
- `git log --oneline --all --grep="02-01"` shows plan commits
