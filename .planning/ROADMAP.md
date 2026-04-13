# Roadmap: Trask River Cam v1.2

**Milestone:** v1.2 — Stream Reliability & Error Handling
**Created:** 2026-04-13
**Phases:** 2
**Requirements:** 6
**Debug reference:** `.planning/debug/hls-playback-reliability.md`

## Phase Overview

| #   | Phase                    | Goal                                                                     | Requirements                                | Success Criteria      |
| --- | ------------------------ | ------------------------------------------------------------------------ | ------------------------------------------- | --------------------- |
| 1   | HLS Playback Reliability | Stream starts consistently with minimal retries and clean console output | STRM-01, STRM-02, STRM-03, STRM-04, STRM-05 | Complete (2026-04-13) |
| 2   | Counterscale CORS Fix    | Analytics requests succeed without CORS errors                           | CORS-01                                     | 1 pending             |

## Phase Details

### Phase 1: HLS Playback Reliability

**Goal:** The HLS video stream starts consistently across all browsers within seconds, using HLS.js's built-in recovery instead of destructive remounts, with clean console output
**Depends on:** Nothing
**Requirements:** STRM-01, STRM-02, STRM-03, STRM-04, STRM-05

**Success Criteria:**

1. VideoPlayer does not remount `<media-player>` as its primary retry strategy — only as a last resort after HLS.js recovery fails
2. `levelEmptyError` during stream startup is logged once at debug level and handled silently — no console spam, no page state transitions
3. JWT signed URL has a TTL of at least 3600 seconds
4. Console output during normal stream startup is limited to meaningful state transitions (e.g., "connecting", "buffering", "playing")
5. Page state machine does not enter `ended_confirming` for transient HLS startup errors — only for actual stream end or unrecoverable errors

**Key context:**

- Root causes RC1–RC5 from `.planning/debug/hls-playback-reliability.md` all apply to this phase
- **CRITICAL: The stream state machine in +page.svelte is tightly coupled to VideoPlayer error events** — changes to error handling MUST be tested against all stream phases (idle → starting → viewing → timeout → restart)
- HLS.js has built-in retry with exponential backoff for `levelEmptyError` — the fix should trust this mechanism
- Safari uses native HLS (not HLS.js) — test error recovery behavior in both Chrome and Safari
- The `xhrSetup` Cache-Control header should be removed (redundant with cache-bust param and may cause CORS preflight)
- The dual error handler architecture (handleError + onLiveError) should be consolidated
- vidstack is version-sensitive — pin and test after changes (carried from v1.1)
- Consider adding a `connecting`/`buffering` visual state for users while HLS manifest is empty

**Plans:** 2/2 plans complete

Plans:

- [x] 01-01-PLAN.md — Replace remount retry loop with HLS.js-native recovery, consolidate error handlers, clean up logging
- [x] 01-02-PLAN.md — Extend JWT TTL to 3600s, harden page state machine (ended_confirming only from viewing)

---

### Phase 2: Counterscale CORS Fix

**Goal:** Counterscale analytics tracker requests from traskriver.com succeed without CORS errors
**Depends on:** Nothing (independent of Phase 1)
**Requirements:** CORS-01

**Success Criteria:**

1. Opening traskriver.com produces no CORS errors for counterscale.jspn.workers.dev requests in the browser console

**Key context:**

- The fix is on the Counterscale Cloudflare Worker deployment, NOT in this repo's code
- The Worker needs to return `Access-Control-Allow-Origin` headers (either `*` or `https://traskriver.com`)
- Integration code in `+layout.svelte` is correct — the Worker just doesn't respond with CORS headers
- This may require updating the Counterscale Worker's wrangler config or adding middleware

**Plans:** 0 plans — needs `/gsd-plan-phase`

---

## Coverage

| Requirement | Phase   |
| ----------- | ------- |
| STRM-01     | Phase 1 |
| STRM-02     | Phase 1 |
| STRM-03     | Phase 1 |
| STRM-04     | Phase 1 |
| STRM-05     | Phase 1 |
| CORS-01     | Phase 2 |

**Coverage:** 6/6 requirements mapped

---

_Roadmap created: 2026-04-13_
