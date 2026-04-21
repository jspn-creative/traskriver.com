---
phase: 06-mediamtx-supervisor-rtsp-ingest
verified: 2026-04-21T01:35:35.989Z
status: human_needed
score: 10/10 must-haves verified (code + static gates)
re_verification: null
gaps: []
human_verification:
  - test: ROADMAP success criterion 1 — kill MediaMTX under supervisor
    expected: Supervisor respawns with backoff 1→30s cap; after 60s clean ready uptime backoff resets; SIGTERM shutdown escalates SIGKILL after 10s
    why_human: Needs running mediamtx binary + stream process; cannot simulate kill -9 / SIGTERM timing in CI here
  - test: ROADMAP success criterion 2 — camera unplug / extended outage
    expected: Supervisor leaves `ready` when path not ready; reconnect restores path; manifest behavior per ROADMAP (muxer recreate vs literal EXT-X-DISCONTINUITY)
    why_human: Requires physical camera/network; stall path (75s) vs disconnect path differs
  - test: ROADMAP success criterion 4 — curl HLS manifest
    expected: `http://127.0.0.1:${MEDIAMTX_HLS_PORT}/trask/index.m3u8` shows ~2s EXTINF and 6-segment window
    why_human: Needs live ingest + MediaMTX; cache headers explicitly Phase 8
  - test: STRM-03 / STRM-07 — segments on disk
    expected: `.ts` under `HLS_DIR`; served from MediaMTX origin port, not Hono
    why_human: Requires runtime pipeline
---

# Phase 6: MediaMTX Supervisor + RTSP Ingest Verification Report

**Phase Goal:** The Node supervisor spawns MediaMTX, keeps the RTSP→HLS pipeline alive 24/7 with correct backoff, detects stalls, guards codec, and serves H.264 passthrough HLS on tmpfs. MediaMTX serves HLS on its own HTTP origin port; cache-header rewriting is deferred to Phase 8 (reverse proxy).

**Verified:** 2026-04-21T01:35:35.989Z

**Status:** human_needed

**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (code + static gates)

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Supervisor spawns MediaMTX with generated yaml, mkdir HLS_DIR + parent | ✓ VERIFIED | `supervisor.ts` `spawn` + `buildMediamtxYaml` + `writeFile` |
| 2 | Exponential backoff 1s→30s cap; doubles on restart schedule | ✓ VERIFIED | `scheduleRestart`: `Math.min(BACKOFF_MAX_MS, backoffMs * 2)` |
| 3 | Backoff resets to 1s after 60s clean uptime in `ready` | ✓ VERIFIED | `onPoll` when `ready`: `CLEAN_UPTIME_MS` + `backoffMs = BACKOFF_INITIAL_MS` |
| 4 | SIGTERM then SIGKILL after 10s grace | ✓ VERIFIED | `killChild`: `SIGTERM_GRACE_MS`, timer → `SIGKILL` |
| 5 | `intentionalStop` / `shuttingDown` skips backoff on our teardown | ✓ VERIFIED | `child.on('exit')` guard; `shutdown()` sets flag |
| 6 | Stall: Δbytes==0 while `ready:true` for 15×5s polls → restart | ✓ VERIFIED | STRM-04 window 75s ∈ 60–90s; `STALL_THRESHOLD_POLLS` + `POLL_INTERVAL_MS` |
| 7 | Codec guard: non-H264 at first ready → fatal log + `process.exit(1)` | ✓ VERIFIED | `onPoll` `waitingReady && info.ready` branch; message prefix `FATAL: camera codec is` |
| 8 | MediaMTX yaml: passthrough HLS, 2s segments, 6 window, `hlsAlwaysRemux`, `rtspTransport: tcp`, path `trask` | ✓ VERIFIED | `mediamtx-config.ts` |
| 9 | HLS dir from env; not served by Node — MediaMTX `hlsAddress` | ✓ VERIFIED | `buildMediamtxYaml` `hlsDirectory`; `server.ts` only `/health` |
| 10 | `/health` uses live `getStatus()` closure; shutdown supervisor before `server.close` | ✓ VERIFIED | `index.ts`, `server.ts` |

**Score:** 10/10 truths verified at code/static level

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `packages/stream/src/config.ts` | Phase 6 env keys | ✓ VERIFIED | `RTSP_URL`, `MEDIAMTX_*`, `HLS_DIR`, `MEDIAMTX_BIN` |
| `packages/stream/src/logger.ts` | Pino redact RTSP_URL paths | ✓ VERIFIED | `redact.paths` + `censor` |
| `packages/stream/src/mediamtx-config.ts` | `buildMediamtxYaml` | ✓ VERIFIED | Locked HLS/RTSP keys |
| `packages/stream/src/mediamtx-api.ts` | `getPathInfo` + `AbortSignal.timeout` | ✓ VERIFIED | `/v3/paths/get/` loopback |
| `packages/stream/src/supervisor.ts` | Full supervisor | ✓ VERIFIED | 228 lines; state machine + watchdog |
| `packages/stream/src/server.ts` | `createApp({ getStatus })` | ✓ VERIFIED | |
| `packages/stream/src/index.ts` | Boot/shutdown order | ✓ VERIFIED | |
| `packages/stream/dist/*.js` | Build emit | ✓ VERIFIED | 7 modules; `node --check` all green |
| Monorepo | `bun check` | ✓ VERIFIED | Exit 0 |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `supervisor.ts` | `mediamtx-config.ts` | `buildMediamtxYaml` → write → spawn | ✓ WIRED |
| `supervisor.ts` | `mediamtx-api.ts` | `getPathInfo` in `pollOnce` | ✓ WIRED |
| `index.ts` | `supervisor.ts` | `new Supervisor` → `getStatus` closure | ✓ WIRED |
| `index.ts` | signal shutdown | `supervisor.shutdown` before `server.close` | ✓ WIRED |

_Note: `gsd-tools verify artifacts` / `verify key-links` returned YAML parse errors for this phase’s PLAN frontmatter (`must_haves`); links and artifacts were verified manually._

### Requirements Coverage

| Requirement | Source Plan(s) | Description (REQUIREMENTS.md) | Status | Evidence |
| ----------- | ---------------- | ----------------------------- | ------ | -------- |
| STRM-02 | 06-02, 06-03, 06-04 | Supervise MediaMTX; backoff; SIGTERM→10s→SIGKILL | ✓ SATISFIED | `supervisor.ts` |
| STRM-03 | 06-01, 06-02, 06-04 | RTSP pull 24/7; reconnect | ✓ SATISFIED | `sourceOnDemand: no`, `rtspTransport: tcp`, reconnect via `!info.ready` → `waitingReady` |
| STRM-04 | 06-01, 06-02, 06-04 | Stall watchdog 60–90s via API | ✓ SATISFIED | 75s threshold; `bytesReceived` + `ready` |
| STRM-05 | 06-01, 06-02, 06-04 | Codec guard H264 | ✓ SATISFIED | Fatal exit on mismatch |
| STRM-06 | 06-01, 06-04 | Passthrough H264 HLS; 2s/6; discontinuity behavior | ✓ SATISFIED (static) | Yaml + ROADMAP note on muxer vs tag; full playback Phase 9 |
| STRM-07 | 06-01, 06-04 | `HLS_DIR`, MediaMTX HTTP, `hlsAlwaysRemux` | ✓ SATISFIED | `mediamtx-config.ts` |

Orphaned requirements (Phase 6): none — STRM-02..07 all listed in plan frontmatter across 06-01..06-04.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | — | — | No blocking TODO/placeholder in `packages/stream/src` |

### Human Verification Required

See YAML `human_verification` — ROADMAP runtime success criteria 1, 2, 4 and on-disk HLS validation.

### Gaps Summary

No code gaps blocking the phase goal at the repository level. Runtime and hardware-dependent ROADMAP bullets are deferred to operator smoke (per 06-04-PLAN).

---

_Verified: 2026-04-21T01:35:35.989Z_

_Verifier: Claude (gsd-verifier)_
