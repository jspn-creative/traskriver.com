---
phase: 02-serverless-media-streaming
plan: 01
subsystem: infra
tags: [cloudflare-stream, ffmpeg, rtsp, rtmps, bun]

# Dependency graph
requires: []
provides:
  - scripts/push-stream.ts: RTSP-to-Cloudflare-Stream push script via ffmpeg RTMPS
  - package.json push-stream script: bun run push-stream launches the push script
  - .env.example: documents CF_STREAM_LIVE_INPUT_KEY, CF_STREAM_LIVE_INPUT_UID, CF_STREAM_CUSTOMER_CODE
affects:
  - 02-serverless-media-streaming

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'External push script: RTSP ingest is now a standalone push script, not embedded in the SvelteKit app'
    - 'RTMPS output: ffmpeg pushes to Cloudflare Stream via flv+RTMPS instead of writing local HLS files'

key-files:
  created:
    - scripts/push-stream.ts
  modified:
    - package.json
    - .env.example
  deleted:
    - scripts/stream.ts

key-decisions:
  - 'Delete scripts/stream.ts without backup — local HLS approach is incompatible with Cloudflare deployment'
  - 'Use aac audio codec for Cloudflare Stream compatibility (old script used copy)'
  - 'Output format flv over RTMPS (not hls to local filesystem)'

patterns-established:
  - 'Push script pattern: external ffmpeg script pushes to cloud ingest endpoint rather than writing to static/'

requirements-completed:
  - STRM-01

# Metrics
duration: 1min
completed: 2026-03-18
---

# Phase 2 Plan 01: Cloudflare Stream Push Script Summary

**Replaced local ffmpeg-to-HLS script (`scripts/stream.ts`) with a Cloudflare Stream RTMPS push script (`scripts/push-stream.ts`) using flv output format and aac audio codec**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-18T11:08:30Z
- **Completed:** 2026-03-18T11:09:45Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 1 deleted, 2 modified)

## Accomplishments

- Deleted `scripts/stream.ts` (local HLS writer that blocked Cloudflare deployment)
- Created `scripts/push-stream.ts` targeting `rtmps://live.cloudflare.com:443/live/${CF_STREAM_LIVE_INPUT_KEY}`
- Updated `package.json` to replace `stream` script with `push-stream`
- Updated `.env.example` with all three Cloudflare Stream env vars: `CF_STREAM_LIVE_INPUT_KEY`, `CF_STREAM_LIVE_INPUT_UID`, `CF_STREAM_CUSTOMER_CODE`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create push-stream.ts and delete stream.ts** - `4f995e2` (feat)
2. **Task 2: Update package.json and .env.example** - `b0ade0a` (chore)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified

- `scripts/push-stream.ts` — New RTSP-to-Cloudflare-Stream push script via ffmpeg RTMPS
- `scripts/stream.ts` — **Deleted** (local HLS writer, incompatible with Cloudflare deployment)
- `package.json` — Replaced `"stream"` script with `"push-stream"` pointing to push-stream.ts
- `.env.example` — Added CF_STREAM_LIVE_INPUT_KEY, CF_STREAM_LIVE_INPUT_UID, CF_STREAM_CUSTOMER_CODE

## Decisions Made

- Used `aac` as audio codec instead of `copy` — Cloudflare Stream requires transcoded audio
- Used `-f flv` output format for RTMPS compatibility (not `-f hls`)
- No local filesystem output needed — Cloudflare Stream handles HLS delivery

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**External services require manual configuration.** See [02-USER-SETUP.md](./02-USER-SETUP.md) for:

- `CF_STREAM_LIVE_INPUT_KEY` — Cloudflare Dashboard → Stream → Live Inputs → [your input] → RTMPS Key
- `CF_STREAM_LIVE_INPUT_UID` — Cloudflare Dashboard → Stream → Live Inputs → [your input] → UID
- `CF_STREAM_CUSTOMER_CODE` — Cloudflare Dashboard → Stream → [any video] → HLS URL → customer-{code} segment

## Next Phase Readiness

- STRM-01 satisfied: local ffmpeg ingest removed, push script established
- Ready for Phase 2 Plan 02 (or next plan in the phase)
- Users need to configure Cloudflare Stream credentials in `.env` before `bun run push-stream` works

---

_Phase: 02-serverless-media-streaming_
_Completed: 2026-03-18_
