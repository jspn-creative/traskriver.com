---
phase: 01-hls-playback-reliability
plan: 01
subsystem: ui
tags: [hls, vidstack, svelte]

requires: []
provides:
  - Single hls-error handler with startup-tolerant classification
  - Last-resort remount after fatal (10s once)
affects: [01-hls-playback-reliability]

tech-stack:
  added: []
  patterns:
    - 'Trust HLS.js recovery; surface onError only for fatal'

key-files:
  created: []
  modified:
    - packages/web/src/lib/components/VideoPlayer.svelte

key-decisions:
  - 'Removed interval remount and cache-busted URL; use liveSrc + native retry'
  - 'Fatal-only onError; levelEmptyError / manifestParsingError / 204 ignored'

patterns-established:
  - 'Dev-only logs via import.meta.env.DEV'

requirements-completed: [STRM-01, STRM-02, STRM-04]

duration: 15min
completed: 2026-04-13
---

# Phase 01: HLS Playback Reliability — Plan 01

**VideoPlayer now relies on HLS.js backoff instead of a 4s remount loop; fatal errors still notify the page after one optional delayed remount.**

## Performance

- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Removed `xhrSetup`, interval retry, dual error paths, and noisy `console.log` helpers
- Consolidated on `hls-error` with `levelEmptyError` / manifest-warmup early returns

## Task Commits

1. **Task 1: Replace remount retry loop with HLS.js-native recovery** — `e47e1bf` (fix)

## Files Created/Modified

- `packages/web/src/lib/components/VideoPlayer.svelte` — error handling, logging, last-resort remount

## Self-Check: PASSED
