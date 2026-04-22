---
phase: 08-web-swap-full-cleanup
plan: 01
subsystem: ui
tags: [svelte, vidstack, hls, posthog]
requires:
  - phase: 06-mediamtx-supervisor-rtsp-ingest
    provides: MediaMTX HLS origin and segment cadence assumptions
provides:
  - Direct self-hosted HLS playback in `VideoPlayer.svelte`
  - Four-state web playback flow (`connecting`, `viewing`, `degraded`, `error`)
  - Public stream URL env documentation via `PUBLIC_STREAM_HLS_URL`
affects: [08-02, 08-03, web playback, relay cleanup]
tech-stack:
  added: []
  patterns: [LEVEL_LOADED media-sequence stall detection, always-mounted autoplay player]
key-files:
  created: [packages/web/.env.example]
  modified:
    - packages/web/src/lib/components/VideoPlayer.svelte
    - packages/web/src/routes/+page.svelte
    - packages/web/src/app.d.ts
key-decisions:
  - "Use provider library LEVEL_LOADED events from vidstack-bound hls instance for stall detection."
  - "Keep static public env usage and add local typing declaration for PUBLIC_STREAM_HLS_URL."
patterns-established:
  - "Web stream playback now starts immediately on mount without demand API calls."
  - "Degraded camera detection is sequence-progression based, not request-probe based."
requirements-completed: [WEB-01, WEB-02, WEB-03, WEB-04]
duration: 6 min
completed: 2026-04-22
---

# Phase 08 Plan 01: Web swap player/page rewrite summary

**Self-hosted HLS playback now runs directly from `PUBLIC_STREAM_HLS_URL` with a collapsed four-state page flow and media-sequence degraded/recovery detection.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-22T21:08:08Z
- **Completed:** 2026-04-22T21:14:51Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Replaced Cloudflare Stream manifest-probe logic with direct vidstack HLS playback and remount-on-error behavior.
- Added `LEVEL_LOADED` media-sequence tracking to trigger degraded/recovered callbacks from the player.
- Rebuilt route state management to exactly four phases with autoplay-on-load and updated PostHog event set.
- Added `packages/web/.env.example` with `PUBLIC_STREAM_HLS_URL` and updated local typing to keep static public env import type-safe.

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite VideoPlayer.svelte for direct HLS playback with stall detection** - `f7cff83` (feat)
2. **Task 2: Rewrite +page.svelte with 4-state machine, auto-play, and PostHog events** - `d1a8e58` (feat)

Additional auto-fix:

3. **Post-task fix: Compact VideoPlayer to planned footprint** - `f3ef53d` (fix)

## Files Created/Modified

- `packages/web/src/lib/components/VideoPlayer.svelte` - Simplified direct HLS component with sequence stall detection and remount recovery.
- `packages/web/src/routes/+page.svelte` - Four-state autoplay route with degraded/error overlays and streamlined status UI.
- `packages/web/.env.example` - Documents required `PUBLIC_STREAM_HLS_URL` value.
- `packages/web/src/app.d.ts` - Adds static-public env declaration for `PUBLIC_STREAM_HLS_URL`.

## Decisions Made

- Used `provider.library?.Events?.LEVEL_LOADED` from vidstack provider context instead of direct `hls.js` import to avoid missing package/type dependency while preserving event-based stall detection.
- Added a local `$env/static/public` declaration for `PUBLIC_STREAM_HLS_URL` to preserve static public env pattern and keep `bun check` green.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Resolved missing env/static/public export typing**
- **Found during:** Task 2
- **Issue:** `bun check` failed because `PUBLIC_STREAM_HLS_URL` was not exported in generated static env typings.
- **Fix:** Added explicit module declaration in `packages/web/src/app.d.ts`.
- **Files modified:** `packages/web/src/app.d.ts`
- **Verification:** `bun check` passes.
- **Committed in:** `d1a8e58`

**2. [Rule 3 - Blocking] Removed direct `hls.js` import**
- **Found during:** Task 2
- **Issue:** `bun check` failed due missing `hls.js` dependency/type package in `packages/web`.
- **Fix:** Switched to vidstack provider instance event constants (`provider.library?.Events?.LEVEL_LOADED`).
- **Files modified:** `packages/web/src/lib/components/VideoPlayer.svelte`
- **Verification:** `bun check` passes and `LEVEL_LOADED` listener remains present.
- **Committed in:** `d1a8e58`

**3. [Rule 1 - Bug] Reduced player file size to planned scope**
- **Found during:** Final verification
- **Issue:** `VideoPlayer.svelte` remained much larger than planned target.
- **Fix:** Compacted implementation while preserving required behavior.
- **Files modified:** `packages/web/src/lib/components/VideoPlayer.svelte`
- **Verification:** file line count = 123; `bun check` passes.
- **Committed in:** `f3ef53d`

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All deviations were execution-local and necessary to meet correctness and plan sizing goals.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `08-02-PLAN.md`. The web player/page flow is now aligned with self-hosted HLS assumptions and relay-era state machinery is removed from these two core surfaces.

---
*Phase: 08-web-swap-full-cleanup*
*Completed: 2026-04-22*

## Self-Check: PASSED
