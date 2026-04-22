---
phase: 08-web-swap-full-cleanup
verified: 2026-04-22T21:26:40Z
status: passed
score: 10/10 must-haves verified
gaps: []
---

# Phase 8: Web Swap + Full Cleanup Verification Report

**Phase Goal:** The web client plays from the self-hosted HLS URL, page state machine is collapsed to 4 states, and relay/demand/JWT/Cloudflare Stream pipeline is removed in the same shipping branch.
**Verified:** 2026-04-22T21:26:40Z
**Status:** passed
**Re-verification:** Yes — gap closure (env example + shared README)

## Goal Achievement

### Observable Truths

| #   | Truth                                                       | Status     | Evidence                                                                                                                                                           |
| --- | ----------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ---------- | ------------------------------------------ |
| 1   | Web uses `PUBLIC_STREAM_HLS_URL` for playback input         | ✓ VERIFIED | `packages/web/src/routes/+page.svelte` passes `liveSrc={env.PUBLIC_STREAM_HLS_URL}` to `VideoPlayer`; `packages/web/.env.example` defines `PUBLIC_STREAM_HLS_URL`. |
| 2   | Video player removed CF Stream probe/JWT path               | ✓ VERIFIED | `packages/web/src/lib/components/VideoPlayer.svelte` has no `manifestReady`/probe/JWT logic; direct `src={liveSrc}` playback only.                                 |
| 3   | Degraded detection is `LEVEL_LOADED` + media-sequence based | ✓ VERIFIED | `VideoPlayer.svelte` tracks `lastMediaSequence`, uses `STALL_THRESHOLD_MS = 30_000`, listens on `LEVEL_LOADED`, and triggers `onDegraded`/`onRecovered`.           |
| 4   | Page state machine is exactly 4 states                      | ✓ VERIFIED | `+page.svelte` uses `phase = 'connecting'                                                                                                                          | 'viewing' | 'degraded' | 'error'`; no legacy states in state union. |
| 5   | Start-button/demand/relay polling path is removed           | ✓ VERIFIED | No `registerDemand`/`prefetchRelayStatus`/`pollRelayStatus`/`getStreamInfo`/`LiveViewerCount` usage in `+page.svelte`; player mounted unconditionally.             |
| 6   | Legacy route/component/type surfaces were deleted           | ✓ VERIFIED | `stream.remote.ts`, relay/demand/test-kv API routes, `LiveViewerCount.svelte`, and `packages/web/src/lib/types.ts` are absent.                                     |
| 7   | Workspace + CI cleanup completed                            | ✓ VERIFIED | `packages/relay` directory absent; `.github/workflows/deploy-relay.yml` absent; root `package.json` has no relay workspace/scripts.                                |
| 8   | Repo checks are green after cleanup                         | ✓ VERIFIED | `bun check` and `bun lint` both exit 0 in repo root.                                                                                                               |
| 9   | Relay/CF trace removal is complete in active branch files   | ✓ VERIFIED | `packages/web/.dev.vars.example` documents only `PUBLIC_STREAM_HLS_URL` (relay-era vars removed).                                                                  |
| 10  | Package docs reflect post-relay architecture                | ✓ VERIFIED | `packages/shared/README.md` describes empty placeholder package post Phase 7 / relay removal.                                                                      |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact                                             | Expected                                              | Status     | Details                                                               |
| ---------------------------------------------------- | ----------------------------------------------------- | ---------- | --------------------------------------------------------------------- |
| `packages/web/src/lib/components/VideoPlayer.svelte` | Direct HLS player + stall detection                   | ✓ VERIFIED | Substantive and wired via callbacks + `LEVEL_LOADED` flow.            |
| `packages/web/src/routes/+page.svelte`               | 4-state page + autoplay + overlays                    | ✓ VERIFIED | Substantive and wired to `VideoPlayer` with `PUBLIC_STREAM_HLS_URL`.  |
| `packages/web/.env.example`                          | HLS URL documentation                                 | ✓ VERIFIED | Contains `PUBLIC_STREAM_HLS_URL=...`.                                 |
| `packages/web/wrangler.jsonc`                        | No relay/KV bindings                                  | ✓ VERIFIED | No `kv_namespaces`, `RIVER_KV`, or CF stream env bindings.            |
| `packages/web/src/app.d.ts`                          | No relay/demand platform env entries                  | ✓ VERIFIED | Relay/KV env entries removed; only static public declaration remains. |
| `package.json`                                       | No relay workspace/scripts; includes stream workspace | ✓ VERIFIED | Workspaces include `web/shared/stream`; no relay scripts.             |
| `turbo.json`                                         | No relay-specific config                              | ✓ VERIFIED | Generic task config only; no relay references.                        |
| `packages/web/.dev.vars.example`                     | No relay-era env template                             | ✓ VERIFIED | Only `PUBLIC_STREAM_HLS_URL` template.                                |
| `packages/shared/README.md`                          | No relay-era consumer docs                            | ✓ VERIFIED | Documents intentional empty export; no relay consumer.                |

### Key Link Verification

| From                                   | To                   | Via                                                   | Status | Details                                                            |
| -------------------------------------- | -------------------- | ----------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| `packages/web/src/routes/+page.svelte` | `VideoPlayer.svelte` | `liveSrc={env.PUBLIC_STREAM_HLS_URL}` prop wiring     | WIRED  | Direct prop binding present.                                       |
| `VideoPlayer.svelte`                   | hls.js lifecycle     | `LEVEL_LOADED` media-sequence watcher                 | WIRED  | `provider.instance` listener + stall interval + recovery callback. |
| Root `package.json`                    | Monorepo workspaces  | includes `packages/stream`, excludes `packages/relay` | WIRED  | Workspace array is clean and current.                              |
| Cleaned code/config                    | deleted relay files  | no active imports/usages                              | WIRED  | No source imports to deleted relay/demand files found.             |

### Requirements Coverage

| Requirement | Source Plan     | Description                                                                  | Status      | Evidence                                                                                             |
| ----------- | --------------- | ---------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| `WEB-01`    | `08-01-PLAN.md` | `VideoPlayer` points to `PUBLIC_STREAM_HLS_URL`; CF Stream URL logic removed | ✓ SATISFIED | `+page.svelte` uses `env.PUBLIC_STREAM_HLS_URL`; `VideoPlayer.svelte` has no probe/JWT path.         |
| `WEB-02`    | `08-01-PLAN.md` | `LEVEL_LOADED`/media-sequence drives degraded state; no `/health` polling    | ✓ SATISFIED | `VideoPlayer.svelte` has `LEVEL_LOADED` + sequence stall logic; no `/health` polling in page/player. |
| `WEB-03`    | `08-01-PLAN.md` | 4-state machine; remove start button + demand + relay polling                | ✓ SATISFIED | 4-state union in `+page.svelte`; no demand/relay functions.                                          |
| `WEB-04`    | `08-01-PLAN.md` | Offline overlay + auto-recovery                                              | ✓ SATISFIED | `+page.svelte` contains "Camera offline — retrying…" degraded overlay and recovery callback path.    |
| `CLEAN-01`  | `08-02-PLAN.md` | Delete web relay/demand/JWT routes/components                                | ✓ SATISFIED | Deleted files confirmed absent.                                                                      |
| `CLEAN-02`  | `08-02-PLAN.md` | Remove CF stream/KV bindings                                                 | ✓ SATISFIED | `wrangler.jsonc` + `app.d.ts` cleaned; `.dev.vars` uses `PUBLIC_STREAM_HLS_URL`.                     |
| `CLEAN-03`  | `08-03-PLAN.md` | Delete relay package + workflow (+ docs implication)                         | ✓ SATISFIED | Package/workflow deleted; `packages/shared/README.md` aligned with post-relay placeholder.           |
| `CLEAN-05`  | `08-03-PLAN.md` | Workspace refs updated + checks pass                                         | ✓ SATISFIED | `package.json`/`turbo.json` clean; `bun check` and `bun lint` pass.                                  |

All requirement IDs declared in phase plans are present in `REQUIREMENTS.md`: `WEB-01`, `WEB-02`, `WEB-03`, `WEB-04`, `CLEAN-01`, `CLEAN-02`, `CLEAN-03`, `CLEAN-05`. No orphaned Phase 8 requirement IDs found.

### Anti-Patterns Found

None after gap closure.

### Human Verification Required

### 1. Cross-browser startup latency

**Test:** Load the site in Chrome (macOS + Windows), Firefox, Safari (iOS + macOS), with valid stream origin.
**Expected:** Stream reaches playing state within <=5s and no 4xx calls to deleted relay/demand routes.
**Why human:** Requires real browsers/platforms and runtime network behavior.

### 2. Camera disconnect/recovery UX

**Test:** Simulate camera disconnect, wait for degraded state, then restore camera feed.
**Expected:** UI shows "Camera offline — retrying…" while degraded; auto-recovers to viewing when sequences resume.
**Why human:** Requires live origin disruption/recovery not reproducible through static code inspection.

### Gaps Summary

None — prior doc/env gaps closed; phase goal satisfied for tracked artifacts.

---

_Re-verified: 2026-04-22 — gap closure commit_
