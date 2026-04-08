---
phase: 08-stream-ux
verified: 2026-04-08T00:00:00Z
status: gaps_found
score: 16/17 must-haves verified
gaps:
  - truth: "Start stream button works even when relay is unavailable — label changes to 'Try starting stream'"
    status: failed
    reason: "Unavailable label is shown, but button is disabled in unavailable phase due to sessionActive-based disable logic."
    artifacts:
      - path: "packages/web/src/lib/components/PassDetailsPanel.svelte"
        issue: "buttonDisabled is derived from sessionActive || demandLoading, and sessionActive is true in unavailable phase."
    missing:
      - "Allow CTA interaction in unavailable phase (keep label 'Try starting stream' and make click path register demand/retry)."
---

# Phase 08: Stream UX Verification Report

**Phase Goal:** Stream UX driven by real relay state with accurate starting/live/ended/unavailable behavior.
**Verified:** 2026-04-08T00:00:00Z
**Status:** gaps_found
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | GET `/api/relay/status` returns typed state/timestamp/stale from KV | ✓ VERIFIED | `packages/web/src/routes/api/relay/status/+server.ts` has `GET`, KV read, typed `RelayStatusResponse` JSON |
| 2 | GET `/api/relay/status` returns null-state stale response when key missing/invalid | ✓ VERIFIED | `emptyRelayStatus` returned on missing/invalid payload |
| 3 | GET `/api/relay/status` is public; POST remains bearer-protected | ✓ VERIFIED | `GET` has no auth branch; `POST` keeps `authorization` bearer check |
| 4 | Stale detection uses shared constants | ✓ VERIFIED | Uses `RELAY_STATUS_STALE_THRESHOLD_MS` and `RELAY_STATUS_TTL_SECONDS` from `@river-stream/shared` |
| 5 | Shared `RelayStatusResponse` contract exported for endpoint/page consumption | ✓ VERIFIED | `packages/shared/index.ts` exports type; imported in `+server.ts` and `+page.svelte` |
| 6 | Page shows starting state with pulse while waiting for live stream | ✓ VERIFIED | `+page.svelte` overlay `phase === 'starting'` with pulse text |
| 7 | Page shows ended prompt in video area with restart button | ✓ VERIFIED | `+page.svelte` overlay `phase === 'ended'` with `Watch again` button |
| 8 | Restart triggers new demand flow and returns to starting polling flow | ✓ VERIFIED | `restartStream()` calls `registerDemand()`, which sets `phase='starting'` and `polling=true` |
| 9 | Page shows unavailable state distinct from starting when relay is stale | ✓ VERIFIED | `pollRelayStatus()` sets `phase='unavailable'`; unavailable overlay rendered |
| 10 | Page polls GET `/api/relay/status` every 3s after demand registration | ✓ VERIFIED | `POLL_INTERVAL_MS = 3000`, polling effect with timeout chain, enabled in `registerDemand()` |
| 11 | Polling stops when `VideoPlayer` confirms playback | ✓ VERIFIED | `onPlaybackStart()` sets `polling=false`; wired via `onPlaying={onPlaybackStart}` |
| 12 | Polling resumes on fatal playback error while live/viewing | ✓ VERIFIED | `onPlaybackError()` sets `phase='ended_confirming'` and `polling=true` |
| 13 | Starting timeout (>60s responsive time) produces error state | ✓ VERIFIED | Timeout logic in `pollRelayStatus()` sets `phase='error'` after `STARTING_TIMEOUT_MS` |
| 14 | Relay prefetch on load seeds initial relay metadata | ✓ VERIFIED | `prefetchRelayStatus()` invoked once via `relayPrefetched` effect |
| 15 | Start CTA remains usable in unavailable state with “Try starting stream” behavior | ✗ FAILED | Label exists, but unavailable state is disabled by `buttonDisabled` |
| 16 | Stream-meaningful phase names replace old sales/connecting/telemetry naming | ✓ VERIFIED | `phase` union uses `idle/starting/live/viewing/ended/unavailable/error` |
| 17 | Fake transition chain removed; transitions driven by relay polling + player events | ✓ VERIFIED | No `handleBeginConnection`; transitions controlled by relay fetch + `onPlaying/onError` |

**Score:** 16/17 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/shared/index.ts` | Relay status response type + constants | ✓ VERIFIED | Exists, substantive exports present, imported by API/page |
| `packages/web/src/routes/api/relay/status/+server.ts` | Public GET + protected POST relay status endpoint | ✓ VERIFIED | Exists, GET wired to KV + shared types/constants, POST auth intact |
| `packages/web/src/routes/+page.svelte` | Relay-driven stream state machine and overlays | ✓ VERIFIED | Exists, substantive polling/events/overlays and component wiring present |
| `packages/web/src/lib/components/PassDetailsPanel.svelte` | Updated CTA/phase behavior incl unavailable variant | ⚠️ ORPHANED/PARTIAL | Label updated, but unavailable retry interaction blocked by disabled logic |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `packages/web/src/routes/api/relay/status/+server.ts` | `platform.env.RIVER_KV` | reads `relay-status` key | WIRED | `kv.get(RELAY_STATUS_KEY)` present in GET path |
| `packages/web/src/routes/api/relay/status/+server.ts` | `@river-stream/shared` | imports `RelayStatusResponse` + constants | WIRED | Shared imports present and used in stale/response logic |
| `packages/web/src/routes/+page.svelte` | `GET /api/relay/status` | fetch polling every 3s | WIRED | Prefetch + poll fetch calls present; polling enabled by demand flow |
| `packages/web/src/routes/+page.svelte` | `VideoPlayer.svelte` | `onPlaying` stop polling, `onError` resume confirm polling | WIRED | Props wired to handlers that toggle polling as required |
| `packages/web/src/routes/+page.svelte` | `PassDetailsPanel.svelte` | passes phase + demand props + start handler | PARTIAL | Props wired, but unavailable CTA blocked by panel disable logic |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| STRX-01 | `08-01-PLAN.md`, `08-02-PLAN.md` | Show “Starting stream...” for fresh demand while not live | ✓ SATISFIED | Starting overlay and relay-driven starting phase implemented |
| STRX-02 | `08-02-PLAN.md` | Detect end and show restart prompt that re-registers demand | ✓ SATISFIED | Ended overlay + restart handler + demand re-registration path |
| STRX-03 | `08-01-PLAN.md`, `08-02-PLAN.md` | Distinct unavailable state for stale relay timestamp | ✓ SATISFIED | GET stale logic + page unavailable phase/overlay |

All plan-frontmatter IDs are accounted for in `.planning/REQUIREMENTS.md`: `STRX-01`, `STRX-02`, `STRX-03`.
No orphaned Phase 08 requirement IDs detected.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `packages/web/src/lib/components/PassDetailsPanel.svelte` | 28, 90 | Unavailable retry path blocked by disabled CTA | ⚠️ Warning | Prevents intended “Try starting stream” interaction during unavailable state |

### Human Verification Required

Not required for this run because automated verification already found a blocking functional gap.

### Gaps Summary

Core relay-driven UX is implemented and wired end-to-end. One behavior gap remains: the unavailable-state CTA message says “Try starting stream” but is not clickable in that phase, so the expected retry affordance is not fully delivered.

---

_Verified: 2026-04-08T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
