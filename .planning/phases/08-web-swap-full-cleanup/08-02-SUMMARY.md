---
phase: 08-web-swap-full-cleanup
plan: 02
subsystem: web-cleanup
tags: [sveltekit, cloudflare-workers, cleanup, hls]
requires:
  - phase: 08-01
    provides: Direct HLS playback path without relay-era imports
provides:
  - Deleted relay/demand/JWT/KV route and helper files from `packages/web`
  - Removed Cloudflare KV and relay env bindings from worker config/types
  - Left local dev vars on `PUBLIC_STREAM_HLS_URL` for direct HLS playback
affects: [phase-08, web-runtime-config, deployment]
tech-stack:
  added: []
  patterns: [remove dead code with reference scan, keep worker env minimal]
key-files:
  created: [.planning/phases/08-web-swap-full-cleanup/08-02-SUMMARY.md]
  modified:
    - packages/web/src/hooks.server.ts
    - packages/web/wrangler.jsonc
    - packages/web/src/app.d.ts
    - packages/web/src/lib/index.ts
key-decisions:
  - "Inline PostHog client setup in hooks error handler after deleting server helper"
  - "Drop stale `src/lib/index.ts` relay type export so cleanup compiles cleanly"
patterns-established:
  - "Relay-era surface removal includes import scans + typecheck before final commit"
requirements-completed: [CLEAN-01, CLEAN-02]
duration: 1min
completed: 2026-04-22
---

# Phase 08 Plan 02: Web Cleanup Summary

**Relay-era web routes/helpers were removed and worker env config was reduced to direct public HLS-only bindings.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-22T21:16:51Z
- **Completed:** 2026-04-22T21:18:18Z
- **Tasks:** 2
- **Files modified:** 11 tracked (+ local `.dev.vars` update)

## Accomplishments
- Deleted 7 dead files tied to old stream JWT, relay status, demand, KV test, and viewer count.
- Removed `kv_namespaces`/`RIVER_KV` and relay env typing from worker config declarations.
- Updated local dev env to `PUBLIC_STREAM_HLS_URL` and confirmed no relay/KV bindings remain.

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete dead route files, components, types, and server helpers** - `acd1c26` (feat)
2. **Task 2: Clean wrangler.jsonc, app.d.ts, and .dev.vars of relay/KV bindings** - `87e27d2` (feat)

## Files Created/Modified
- `packages/web/src/routes/stream.remote.ts` - deleted obsolete CF Stream JWT query route
- `packages/web/src/routes/api/stream/demand/+server.ts` - deleted obsolete demand endpoint
- `packages/web/src/routes/api/relay/status/+server.ts` - deleted obsolete relay status endpoint
- `packages/web/src/routes/api/test-kv/+server.ts` - deleted obsolete KV debug endpoint
- `packages/web/src/lib/components/LiveViewerCount.svelte` - deleted dead component
- `packages/web/src/lib/server/posthog.ts` - deleted dead server helper
- `packages/web/src/lib/types.ts` - deleted dead relay types/constants
- `packages/web/src/hooks.server.ts` - inlined PostHog client creation (blocking fix)
- `packages/web/wrangler.jsonc` - removed KV namespace bindings
- `packages/web/src/app.d.ts` - removed relay/KV platform env typing
- `packages/web/src/lib/index.ts` - removed stale export to deleted types

## Decisions Made
- Keep `declare namespace App {}` with comment instead of deleting the block entirely.
- Keep `.dev.vars` local/ignored while still updating it to the new public HLS var.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed deleted helper import in hooks**
- **Found during:** Task 1
- **Issue:** `hooks.server.ts` imported `$lib/server/posthog` after helper deletion.
- **Fix:** Replaced helper import with direct `posthog-node` client construction in `handleError`.
- **Files modified:** `packages/web/src/hooks.server.ts`
- **Verification:** `bun check` passed.
- **Committed in:** `acd1c26`

**2. [Rule 3 - Blocking] Removed stale type re-export**
- **Found during:** Task 2
- **Issue:** `packages/web/src/lib/index.ts` exported from deleted `./types.ts`, breaking `bun check`.
- **Fix:** Removed the stale export line.
- **Files modified:** `packages/web/src/lib/index.ts`
- **Verification:** `bun check` passed.
- **Committed in:** `87e27d2`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Required for successful cleanup/typecheck; no scope creep.

## Issues Encountered
- `.dev.vars` is ignored by git, so local env cleanup is applied but not task-committed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Web package has no relay/JWT/KV route surface left from legacy stream path.
- Ready for final phase cleanup/verification.

## Self-Check: PASSED

- FOUND: `.planning/phases/08-web-swap-full-cleanup/08-02-SUMMARY.md`
- FOUND: `acd1c26`
- FOUND: `87e27d2`

---
*Phase: 08-web-swap-full-cleanup*
*Completed: 2026-04-22*
