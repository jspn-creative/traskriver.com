---
phase: 01-hls-playback-reliability
plan: 02
subsystem: api
tags: [jwt, svelte, state-machine]

requires:
  - phase: 01-hls-playback-reliability
    provides: VideoPlayer fatal-only onError contract
provides:
  - 1h stream JWT TTL
  - Page guard so ended_confirming only after viewing
affects: []

tech-stack:
  added: []
  patterns:
    - "JWT_TTL_SECONDS constant for signed manifest URLs"

key-files:
  created: []
  modified:
    - packages/web/src/routes/stream.remote.ts
    - packages/web/src/routes/+page.svelte

key-decisions:
  - "Fatal playback loss during relay-live-but-not-playing stays in live for remount retry"

patterns-established: []

requirements-completed: [STRM-03, STRM-05]

duration: 10min
completed: 2026-04-13
---

# Phase 01: HLS Playback Reliability — Plan 02

**Stream tokens last one hour; the home page only treats confirmed playback loss as a stream-end when the user was already in `viewing`.**

## Task Commits

1. **Task 1: JWT TTL 3600s** — `607f2bf` (feat)
2. **Task 2: Harden page state machine** — `f88467b` (fix)

## Self-Check: PASSED
