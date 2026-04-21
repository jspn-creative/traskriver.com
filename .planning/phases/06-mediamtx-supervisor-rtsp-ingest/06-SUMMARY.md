---
phase: 06-mediamtx-supervisor-rtsp-ingest
plan: rollup
subsystem: stream-supervisor
tags: [node22, mediamtx, child_process, rtsp, hls, pino-redact]

requires:
  - phase: 05-packages-stream-skeleton
    provides: '@traskriver/stream skeleton (config, logger, server, index)'
provides:
  - 'MediaMTX supervisor (spawn/respawn, backoff, SIGTERM→10s→SIGKILL)'
  - 'Stall watchdog (5s poll, 75s threshold, ready:true gated)'
  - 'Codec guard (H264 strict equality, fatal exit on mismatch)'
  - 'MediaMTX yaml generator (literal template, hlsAlwaysRemux: yes, rtspTransport: tcp)'
  - 'MediaMTX REST API client (native fetch + AbortSignal.timeout)'
  - 'Live /health status from supervisor.getStatus() (no globals)'
  - 'Pino redaction for RTSP_URL'
  - 'STRM-02..STRM-07 satisfied'
affects:
  - Phase 7 /health expansion (consumes supervisor state internals)
  - Phase 8 deployment (assumes mediamtx on PATH; HLS_DIR aligns with RuntimeDirectory=stream)

tech-stack:
  added: 'none — all work via Node 22 built-ins (child_process, readline, fs/promises) + existing pino/zod/hono'
  patterns:
    - 'Discriminated-union state machine on supervisor instance'
    - 'Closure injection for /health getStatus (no module-level singletons)'
    - 'intentionalStop flag to disambiguate our SIGTERM from a crash'
    - 'Backoff reset gated by readyAt timestamp + 60s clean uptime'

key-files:
  created:
    - packages/stream/src/supervisor.ts
    - packages/stream/src/mediamtx-config.ts
    - packages/stream/src/mediamtx-api.ts
  modified:
    - packages/stream/src/config.ts (5 new env keys)
    - packages/stream/src/logger.ts (pino redact)
    - packages/stream/src/server.ts (createApp accepts getStatus)
    - packages/stream/src/index.ts (Supervisor in boot + shutdown)

key-decisions:
  - 'Backoff: 1→2→4→8→16→30s cap, reset to 1s after 60s clean ready uptime'
  - 'SIGTERM→10s→SIGKILL escalation in killChild()'
  - 'Stall: 15 consecutive 5s polls with Δbytes==0 while ready:true (75s)'
  - 'Codec guard: check ONCE at first ready, fatal process.exit(1) on mismatch'
  - 'rtspTransport: tcp (NOT obsolete sourceProtocol — corrected vs CONTEXT wording per RESEARCH Pitfall #1)'
  - 'hlsAlwaysRemux: yes added per RESEARCH Open Question #3 (warm muxer for 24/7)'
  - '/health payload UNCHANGED at { status } — Phase 7 widens; Phase 6 only changes the source of status to live supervisor read'

patterns-established:
  - 'Supervisor class owns child_process + timers + state — no globals, getStatus injected via closure'
  - 'mediamtx-config.ts and mediamtx-api.ts are pure modules — no side effects, easily testable in Phase 7+ if needed'
  - 'tsc rewriteRelativeImportExtensions verified across 7 emit files'

requirements-completed: [STRM-02, STRM-03, STRM-04, STRM-05, STRM-06, STRM-07]

duration: —
completed: 2026-04-20
---

# Phase 6 rollup: MediaMTX Supervisor + RTSP Ingest

**Always-on MediaMTX child process with exponential backoff, stall + codec guards, literal YAML config + REST poller, live `/health` from `getStatus()` — STRM-02..STRM-07 closed via static gates (Phase 7 widens `/health`).**

## Plans

| Plan  | Summary                                                                                      |
| ----- | -------------------------------------------------------------------------------------------- |
| 06-01 | Zod env keys, Pino RTSP redaction, `buildMediamtxYaml`, `getPathInfo` REST helpers          |
| 06-02 | `Supervisor` — spawn/backoff, SIGTERM→SIGKILL, codec guard, stall watchdog                  |
| 06-03 | `createApp({ getStatus })`, boot/shutdown order (supervisor before HTTP close)                |
| 06-04 | `bun run build`, `node --check` on `dist/*.js`, `bun check`, rollup SUMMARY, STATE/ROADMAP  |

## Files created

- `packages/stream/src/supervisor.ts`, `mediamtx-config.ts`, `mediamtx-api.ts`
- Modified: `config.ts`, `logger.ts`, `server.ts`, `index.ts`

## Decisions locked

- **Backoff:** 1→30s cap, reset to 1s after 60s clean `ready` uptime.
- **Shutdown:** SIGTERM → 10s → SIGKILL in `killChild()`.
- **Stall:** 15× 5s polls with no byte delta while `ready:true` (75s).
- **Codec:** one check at first ready; `process.exit(1)` on non-H264.
- **YAML:** `rtspTransport: tcp`; `hlsAlwaysRemux: yes` for warm muxer.
- **`/health`:** shape still `{ status }` until Phase 7 expands payload.

## Scope deferred to later phases

- **Cache headers** on HLS — Phase 8 reverse proxy (not MediaMTX built-in server).
- **Full `/health` fields** — Phase 7 (codec, restarts, segment age, etc.).
- **systemd, TLS, DNS, binary provisioning** — Phase 8.
- **Web player + relay deletion** — Phase 9.

## Manual smoke (optional, recommended before Phase 7)

1. **`kill -9 $(pgrep mediamtx)`** — backoff grows 1→2→4→8→16→30s; resets after 60s clean uptime.
2. **Camera unplug ≥90s** (or `kill -STOP` ffmpeg publisher) — leaves `ready`, supervised restart; fresh manifest (`EXT-X-MEDIA-SEQUENCE:0` + new segment prefix); hls.js treats as discontinuity.
3. **Force H.265** — `FATAL: camera codec is H265, expected H264` + non-zero exit.
4. **`curl http://localhost:8888/trask/index.m3u8`** — 6-entry window, ~2s `EXTINF` (verify against your `paths` name).
5. **HLS `.ts` on disk** — under `${HLS_DIR}` (default `/run/stream/hls` in Phase 8 tmpfs).

**ffmpeg publisher (local test pattern)** — see `06-RESEARCH.md` §10: second MediaMTX on `:18554` with `source: publisher`, then:

```bash
ffmpeg -re -f lavfi -i "testsrc=size=1280x720:rate=30" \
       -c:v libx264 -preset veryfast -tune zerolatency \
       -g 60 -keyint_min 60 -sc_threshold 0 \
       -pix_fmt yuv420p -b:v 4M \
       -f rtsp -rtsp_transport tcp rtsp://127.0.0.1:18554/testcam
```

## Forward-compat for Phase 7+

Supervisor already tracks codec, restart/stall context, and byte timestamps Plan 02 exposed via `getStatus()` — Phase 7 surfaces these in `/health` without reshaping the class.

## Deviations

- **`#EXT-X-DISCONTINUITY`:** MediaMTX remux typically omits the literal tag; manifest reset + new prefix is **functionally equivalent** for hls.js/vidstack (validated in Phase 9).
- **Cache headers:** prior criterion #4 wording moved to **Phase 8** reverse proxy per ROADMAP amendment after research.

## Next

Phase 7 — full `/health` payload + shared-types purge.
