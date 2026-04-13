---
phase: 02-counterscale-cors-fix
plan: '01'
subsystem: infra
tags: [cloudflare-workers, cors, counterscale, analytics, proxy]

requires:
  - phase: v1.1/01-analytics-integration
    provides: '@counterscale/tracker in +layout.svelte with reporterUrl pointing to counterscale.jspn.workers.dev/tracker'

provides:
  - Cloudflare Worker proxy at counterscale-proxy.jspn.workers.dev that adds CORS headers to all Counterscale requests
  - Updated +layout.svelte reporterUrl pointing to proxy Worker

affects: []

tech-stack:
  added: ['wrangler@^4.63.0', '@cloudflare/workers-types@^4.20250327.0']
  patterns:
    - CORS proxy Worker as lightweight header-injection layer in front of third-party workers.dev endpoints

key-files:
  created:
    - packages/counterscale-proxy/src/index.ts
    - packages/counterscale-proxy/package.json
    - packages/counterscale-proxy/tsconfig.json
    - packages/counterscale-proxy/wrangler.jsonc
  modified:
    - packages/web/src/routes/+layout.svelte
    - package.json
    - bun.lock

key-decisions:
  - "Proxy routes GET -> upstream /collect, /cache -> upstream /cache, POST -> upstream /tracker — mirrors tracker lib's actual URL pattern"
  - 'Strip Host/CF- headers; set minimal Content-Type text/plain on GET so upstream Remix router accepts the request'
  - "global_fetch_strictly_public flag required — Worker-to-workers.dev subrequests without it hit Cloudflare's internal routing and return 404"
  - 'CORS_HEADERS applied to fresh Headers copy of upstream response to avoid immutable response mutation'

requirements-completed:
  - CORS-01

duration: 37min
completed: 2026-04-13
---

# Phase 2 Plan 1: Counterscale CORS Proxy Summary

**Cloudflare Worker proxy at `counterscale-proxy.jspn.workers.dev` adds `Access-Control-Allow-Origin: *` to Counterscale analytics requests, eliminating CORS errors on traskriver.com**

## Performance

- **Duration:** ~37 min
- **Started:** 2026-04-13T19:50:00Z
- **Completed:** 2026-04-13T20:30:00Z
- **Tasks:** 3 (Task 3 = human-verify, approved)
- **Files modified:** 6

## Accomplishments

- New `packages/counterscale-proxy` workspace: Worker handles OPTIONS preflight (204), GET → `/collect`, `/cache` → `/cache`, POST → `/tracker`
- CORS headers injected on every response (`Access-Control-Allow-Origin: *`, Allow-Methods, Allow-Headers, Max-Age)
- `+layout.svelte` `reporterUrl` updated to `https://counterscale-proxy.jspn.workers.dev`
- Both proxy Worker and web app deployed; no CORS errors confirmed in browser

## Task Commits

1. **Task 1: Create counterscale-proxy Worker package** — `0a51d36` (feat)
2. **Task 2: Update reporterUrl + verify** — `88bd385` (feat)
3. **Task 3: Browser verification** — approved by user (no commit)

## Files Created/Modified

- `packages/counterscale-proxy/src/index.ts` — CORS proxy Worker: OPTIONS/GET/POST routing with hardcoded upstream
- `packages/counterscale-proxy/wrangler.jsonc` — Worker config with `global_fetch_strictly_public` flag
- `packages/counterscale-proxy/package.json` — workspace package definition
- `packages/counterscale-proxy/tsconfig.json` — TypeScript config targeting Cloudflare Workers types
- `packages/web/src/routes/+layout.svelte` — reporterUrl → proxy Worker URL
- `package.json` — added counterscale-proxy to workspaces

## Decisions Made

- `global_fetch_strictly_public` compat flag — Worker subrequests to `*.workers.dev` on the same account return 404 without it; Cloudflare routes them internally instead of publicly
- Upstream path mapping: tracker lib actually calls `/collect` (GET) and `/cache` (GET) — not `/tracker`. Plan said POST to `/tracker`, but GET to `/collect` is the real pattern. Proxy now handles both correctly.
- Minimal upstream headers (`Content-Type: text/plain` for GET, passthrough for POST) — forwarding all client headers including `Host` causes Cloudflare upstream routing failures

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Upstream path /tracker returns 404; correct path is /collect for GET**

- **Found during:** Task 2 (verify POST forwarding works)
- **Issue:** Plan specified `UPSTREAM_URL = .../tracker` for all requests. `/tracker` returns 404; Counterscale tracker lib actually hits `/collect` (GET) and `/cache` (GET) via XHR
- **Fix:** `resolveUpstreamTarget()` routes GET → `/collect`, `/cache` → `/cache`, POST stays → `/tracker`
- **Files modified:** `packages/counterscale-proxy/src/index.ts`
- **Verification:** `curl` GET 200, `/cache` GET 200, POST 405 (upstream doesn't accept POST to `/collect` — expected)
- **Committed in:** `88bd385`

**2. [Rule 3 - Blocking] Forward headers caused upstream 404; stripped to minimal set**

- **Found during:** Task 2 (initial proxy verification)
- **Issue:** Forwarding all client headers (including `Host`, CF-\* headers) caused upstream to return 404/HTML Cloudflare error page
- **Fix:** Strip `host`, `connection`, `cf-*` headers; use minimal upstream headers
- **Files modified:** `packages/counterscale-proxy/src/index.ts`
- **Verification:** `curl` through proxy returns expected status codes
- **Committed in:** `88bd385`

**3. [Rule 3 - Blocking] global_fetch_strictly_public required for Worker-to-workers.dev subrequests**

- **Found during:** Task 2 (deployed proxy returning 404 even with correct paths)
- **Issue:** Cloudflare routes Worker subrequests to `*.workers.dev` internally, bypassing the target Worker — returns Cloudflare 404 page
- **Fix:** Added `"compatibility_flags": ["global_fetch_strictly_public"]` to wrangler.jsonc
- **Files modified:** `packages/counterscale-proxy/wrangler.jsonc`
- **Verification:** GET `/collect` through proxy returned 200 after deploy
- **Committed in:** `88bd385`

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All necessary. Upstream path was a plan assumption error (tracker lib behavior not inspected). Header stripping and compat flag are Cloudflare Worker-to-Worker gotchas. No scope creep.

## Issues Encountered

None beyond the deviations above.

## User Setup Required

None — Worker deployed directly via wrangler.

## Next Phase Readiness

- CORS-01 satisfied: zero CORS errors for Counterscale analytics on traskriver.com
- Phase 02 complete, ready for milestone wrap-up or next phase planning

---

_Phase: 02-counterscale-cors-fix_
_Completed: 2026-04-13_
