# Stack Research — `packages/stream` (v1.2)

**Domain:** Always-on Node service: RTSP ingest → HLS origin → Cloudflare CDN → browser (hls.js/vidstack).
**Researched:** 2026-04-20
**Confidence:** HIGH (library versions verified on npm registry + GitHub releases; Context7 for MediaMTX/go2rtc/node-media-server/pino docs; caniuse for HEVC).

---

## TL;DR Recommendation

1. **Supervise MediaMTX (Go binary) from a tiny Node process.** MediaMTX does RTSP→HLS (and LL-HLS) out of the box, with a readable YAML config and an HTTP API. Node's job shrinks to: spawn + supervise + expose `/health` + structured logs + status signalling. This beats every pure-Node option on stability, LL-HLS readiness, and maintenance.
2. **Camera outputs H.264 at 3–6 Mbps CBR, 2s GOP. Node/MediaMTX does stream copy passthrough — no transcode.** Browser HEVC support is still partial-to-absent in Chrome/Firefox in 2026 (see verification), so transcode-to-H.264 on the VPS would be required if the camera sent H.265 — and that doubles CPU cost for zero benefit. Configure the camera for H.264.
3. **Fastify v5 for the tiny Node HTTP server** (`/health`, `/metrics`, optional status webhook). Pairs naturally with Pino (already the project logger pattern) and has the lowest "weight vs features" ratio of the options considered.
4. **Cloudflare in front = cache rules only, not Stream.** Concrete TTLs and `Cache-Control` headers below. **CRITICAL caveat**: Cloudflare's free/Pro/Business CDN ToS forbids serving video files — this is covered in `PITFALLS.md`, not here.

---

## Recommended Stack

### Core Technologies

| Technology   | Version                                | Purpose                                                                                                             | Why Recommended                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MediaMTX** | `v1.17.1` (2026-03-31, GitHub release) | RTSP ingest + HLS/LL-HLS muxer + HTTP origin in one static Go binary. Zero deps. Runs as `./mediamtx mediamtx.yml`. | Battle-tested for exactly this shape (single camera, always-on, HLS out). Handles reconnect to RTSP, variant HLS (LL-HLS/MP4-HLS/legacy), serves manifests+segments directly on its own HTTP port, exposes JSON API for liveness/paths. Eliminates the majority of failure modes of rolling-your-own ffmpeg→HLS loop. Supports H.264, H.265, AV1 codecs for HLS read — but browser codec support, not server support, is the constraint. |
| **Node.js**  | `22.x LTS` (or 24.x when released LTS) | Supervisor process: spawn MediaMTX, read its stderr, expose `/health`, post status to web.                          | Matches monorepo tooling (Bun workspaces tool-time, Node runtime on VPS per PROJECT.md). 22 LTS is production-safe, has stable `node:child_process`, `AbortController`, `fetch` without flags.                                                                                                                                                                                                                                           |
| **ffmpeg**   | `7.x` system package                   | Only used as optional fallback muxer if MediaMTX is ever bypassed; not in hot path.                                 | Already on the Pi for relay — same binary, same contract. Keep as documented fallback, do not make it primary.                                                                                                                                                                                                                                                                                                                           |

### Supporting Libraries

| Library         | Version (verified)              | Purpose                                                                                | When to Use                                                                                                                                                                                                                                        |
| --------------- | ------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **fastify**     | `5.8.5` (npm, 2026-04-14)       | HTTP server for `/health`, optional `/metrics`, optional status webhook receiver.      | Always. Minimal surface, first-class Pino integration, schema validation if we ever add endpoints.                                                                                                                                                 |
| **pino**        | `10.3.1` (npm, 2026-02-09)      | Structured JSON logger.                                                                | Always. Matches `packages/relay`'s logger conventions; Fastify uses Pino natively. Node 22+ supports structured logging but Pino is still the Node standard.                                                                                       |
| **pino-pretty** | `^13.0.0`                       | Dev-time pretty printing.                                                              | Dev only, `NODE_ENV !== 'production'`.                                                                                                                                                                                                             |
| **zod**         | `^3.25.x` (already in monorepo) | Validate env/config at boot.                                                           | Always. Mirrors shared schema practice.                                                                                                                                                                                                            |
| **execa**       | `^9.x`                          | Child process spawn with kill-on-exit, AbortSignal, streaming stdio, backoff-friendly. | For spawning MediaMTX. Cleaner than `node:child_process` for: forced SIGTERM→SIGKILL escalation, exit promise, reading stderr as a stream. The relay's current Bun-spawn pattern in `packages/relay/src/ffmpeg.ts` maps directly onto execa's API. |

### Development Tools

| Tool                                         | Purpose                                      | Notes                                                                                                                                                                       |
| -------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript                                   | Type checking                                | Node-target config: `module: "nodenext"`, `moduleResolution: "nodenext"`, `target: "es2023"`. Keep `tsconfig.json` extending a shared base in `packages/shared` or similar. |
| tsx / native node --experimental-strip-types | Run TS source directly in dev                | Node 22.6+ supports `--experimental-strip-types`; stable path in Node 24. For now use `tsx` for dev; compile to JS with `tsc` for prod.                                     |
| turbo                                        | Monorepo orchestration                       | Already in place. Add `packages/stream` to `turbo.json` pipeline with `build`, `check`, `lint`, `format`.                                                                   |
| bun                                          | Package manager / script runner at tool time | Repo-wide per user rules. Runtime on the VPS is Node; `bun install` at deploy time is fine (lockfile sharing), but `bun run start` should invoke `node dist/index.js`.      |

---

## Architecture Decision: MediaMTX-supervised vs pure-Node

| Option                                                | Verdict      | Rationale                                                                                                                                                                                                                       |
| ----------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. MediaMTX spawned by Node (recommended)**         | **CHOSEN**   | Best stability, built-in RTSP client, LL-HLS path free, HTTP HLS server included. Node code stays tiny. Version pinned to `v1.17.1`.                                                                                            |
| B. ffmpeg spawn with `-f hls` + Fastify serving files | Fallback     | Simpler dependency story (just ffmpeg), but you own: RTSP reconnect logic, manifest lifecycle, segment pruning, partial-segment LL-HLS, CORS. Doable (~200 LOC) but re-invents MediaMTX poorly. Keep as documented alternative. |
| C. go2rtc spawned by Node                             | Viable alt   | `v1.9.14` (2026-01-19). Same pattern as MediaMTX. Main edge: zero-delay WebRTC. We don't need WebRTC — HLS is the contract. MediaMTX's HLS pipeline is more mature. Only choose if/when we want WebRTC live later.              |
| D. node-media-server                                  | **REJECTED** | `v4.2.4` (2026-01-02) is **RTMP/FLV focused**. No RTSP _client_ (it's a publish-side server for RTMP publishers). Can't pull from our camera directly.                                                                          |
| E. fluent-ffmpeg                                      | **REJECTED** | `2.1.3` last published **2024-05-19**, maintainers-wanted notice on README. Abandoned for 2026 purposes. Raw `spawn` (via execa) is clearer anyway.                                                                             |
| F. node-rtsp-stream and similar                       | **REJECTED** | These are MJPEG-over-WebSocket wrappers around ffmpeg for demo players; not RTSP→HLS origin pipelines. Wrong shape.                                                                                                             |

### H.264 passthrough vs H.265 transcode — VERIFIED

**Recommendation: set the camera to H.264.** Passthrough only. No CPU transcode budget needed on the VPS.

Evidence (caniuse.com/hevc, 2026):

- **Chrome**: partial (HW-dependent, OS gated — macOS 11+, Windows w/ HEVC extension)
- **Firefox**: partial (versions 137+ only, desktop only, HW-dependent, disabled by default on many)
- **Edge**: partial (HEVC Video Extensions add-on required on Windows)
- **Safari (desktop & iOS)**: ✅ full

For a public river cam serving anglers on arbitrary desktop + mobile browsers, assuming HEVC would cost viewers. Even hls.js requires fMP4 segments for HEVC (not MPEG-TS), forcing an additional `hls_segment_type fmp4` config + larger client-side gotchas.

If the camera is ever reconfigured to H.265 for bandwidth (it won't help — the ~40 Mbps home upload is not the bottleneck here), MediaMTX/ffmpeg can transcode, but the VPS sizing has to accommodate a 2560×1920 H.265→H.264 transcode at ~30 fps (≈1 vCPU sustained with `libx264 -preset veryfast -crf 23`). Keep this as a written-down-but-not-enabled option in the PLAN.

### HLS Segmenter Choice — CONCRETE

MediaMTX config (excerpt) for our pipeline:

```yaml
paths:
  trask:
    source: rtsp://cam-user:${CAM_PASS}@cam.ddns.example:554/Streaming/Channels/101
    sourceProtocol: tcp
    sourceOnDemand: no
    sourceAnyPortEnable: no

hls: yes
hlsAddress: :8888
hlsVariant: lowLatency # upgrade path; clients that don't grok LL-HLS fall back to MP4-HLS
hlsSegmentCount: 7
hlsSegmentDuration: 2s
hlsPartDuration: 200ms
hlsSegmentMaxSize: 50M
hlsAllowOrigin: '*' # Cloudflare origin pull + JS from our own origin
```

- `lowLatency` variant gives us LL-HLS (`EXT-X-PART`) for free when we want to lower latency later; until then, standard MP4-HLS clients work unchanged.
- Segment duration 2s + 7 segments = ~14s window: reasonable for live with ABR-free single-rendition delivery.
- LL-HLS upgrade is a config flip, not a code rewrite — this is the "upgrade path" the question asks about.

### Node HTTP Server

Fastify 5 wraps:

- `GET /health` → 200 with `{ status: 'ok', mediamtx: 'running', lastRtspConnectedAt, uptimeMs }`. Composes MediaMTX's own health by fetching `http://127.0.0.1:9997/v3/paths/get/trask` internally.
- `GET /status` (optional) for richer observability (bitrate, viewers from MediaMTX `/v3/hlsmuxers/list`).
- No static file serving — **MediaMTX serves the HLS playlists and segments on :8888**. The Node HTTP server is ops-only.

Comparison:

| Framework         | Verdict     | Why                                                                                                                                                                  |
| ----------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **fastify**       | Recommended | First-class Pino integration, low overhead, schema-first if endpoints grow, wide Node ecosystem familiarity. `5.8.5`.                                                |
| hono              | Good alt    | `4.12.14`. Web-standards API is nice, but our deployment is Node-only; fastify's Pino integration and plugin ecosystem are stronger for a long-running Node process. |
| stock `node:http` | Sufficient  | Two routes. Genuinely fine. Downside: own the routing/parsing. Acceptable if we want zero-dep service.                                                               |
| express           | Avoid       | Older, worse perf, worse types, no reason in 2026.                                                                                                                   |

### Process Supervision Pattern (in Node)

Mirror `packages/relay/src/ffmpeg.ts` with these changes for the always-on case:

- **Exponential backoff on restart**: 1s → 2s → 4s → 8s, cap at 30s. Reset on 60s clean uptime.
- **Structured stderr ingest**: parse MediaMTX log lines (JSON lines if `logFormat: json` in `mediamtx.yml`) and forward through pino at matching level.
- **Liveness probe on MediaMTX API**: every 30s, GET `/v3/paths/get/trask`; unhealthy if not `ready: true` for 3 consecutive polls → restart MediaMTX child.
- **Graceful shutdown**: SIGTERM → SIGTERM to child (10s) → SIGKILL. Same pattern as existing relay `FfmpegManager`.
- **systemd unit** owns the Node process; Node owns the MediaMTX child. systemd restart policy: `Restart=always RestartSec=5`.

No need for a supervision library (no pm2, no forever). The existing relay pattern ported to execa fits in ~150 LOC.

---

## Installation

```bash
# In packages/stream/
bun add fastify@5 pino@10 pino-pretty@13 zod execa@9
bun add -d typescript@5 tsx @types/node@22
```

MediaMTX is a **static binary**, installed at deploy time on the VPS, not via npm:

```bash
# One-time VPS setup (owned by user)
MEDIAMTX_VERSION=v1.17.1
ARCH=linux_amd64   # or linux_arm64 for ARM VPS
curl -fsSL -o /tmp/mediamtx.tar.gz \
  https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_VERSION}/mediamtx_${MEDIAMTX_VERSION}_${ARCH}.tar.gz
mkdir -p /opt/stream/mediamtx
tar -xzf /tmp/mediamtx.tar.gz -C /opt/stream/mediamtx
# Binary: /opt/stream/mediamtx/mediamtx
# Config: written by packages/stream at boot, or shipped alongside.
```

Node process spawns `/opt/stream/mediamtx/mediamtx /opt/stream/mediamtx.yml` via execa.

---

## Cloudflare CDN Configuration (HLS Origin Pull)

Cache Rules (Cloudflare dashboard → Caching → Cache Rules), in order:

| #   | Match                                                         | Edge TTL                       | Browser TTL | `Cache-Control` header (set by origin) |
| --- | ------------------------------------------------------------- | ------------------------------ | ----------- | -------------------------------------- |
| 1   | `http.request.uri.path wildcard "*.m3u8"`                     | `1s` (Ignore origin, explicit) | `2s`        | `public, max-age=1, s-maxage=1`        |
| 2   | `http.request.uri.path wildcard "*.ts" or "*.m4s" or "*.mp4"` | `1 day` (respect origin)       | `1 day`     | `public, max-age=86400, immutable`     |
| 3   | `http.request.uri.path eq "/health"`                          | Bypass                         | n/a         | `no-store` (set on Fastify route)      |

Origin-side response headers (emitted by MediaMTX for HLS — verify MediaMTX defaults and override via Cloudflare Transform Rules if needed):

```
# Manifests (.m3u8) — short so segment rollover reaches clients
Cache-Control: public, max-age=1, s-maxage=1
Cloudflare-CDN-Cache-Control: public, max-age=1

# Segments (.ts / .m4s) — names are content-addressed by MediaMTX, safe to pin
Cache-Control: public, max-age=86400, immutable
Cloudflare-CDN-Cache-Control: public, max-age=86400, immutable
```

Notes:

- The manifest TTL of **1 second** matches half the 2s segment duration — the industry rule of thumb that `m3u8 TTL ≈ segmentDuration / 2`. Any higher and clients stall on stale manifests; any lower and it's pointless caching.
- Segment filenames are unique per produced segment in MediaMTX (monotonic numbering), so `immutable` is safe.
- No purge needed in normal operation; on stream restart, new segment filenames differ, so old cached entries just age out.
- `Access-Control-Allow-Origin: *` must be set — MediaMTX's `hlsAllowOrigin: "*"` handles this. Cloudflare should forward the header.
- **Do NOT enable Cloudflare "Auto Minify", "Rocket Loader", or "Mirage"** on HLS paths — none apply and they can damage responses. Create a Configuration Rule to disable on `*.m3u8`, `*.ts`, `*.m4s`.

> ⚠️ **Cloudflare ToS on video via free/Pro/Business CDN**: Cloudflare's Terms of Service restrict non-Enterprise plans from using the CDN to serve video files; the supported path is Cloudflare Stream, R2, or Enterprise. This is a **milestone-level decision**, not a stack choice — see `PITFALLS.md`. STACK assumes this is resolved at the milestone level (Enterprise, R2-backed origin, or risk-accepted by user).

---

## Alternatives Considered

| Recommended       | Alternative                              | When to Use Alternative                                                                                             |
| ----------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| MediaMTX          | go2rtc `v1.9.14`                         | If/when we want low-latency WebRTC playback alongside HLS.                                                          |
| MediaMTX          | Direct ffmpeg `-f hls` spawn from Node   | If introducing a Go binary to the deploy surface is rejected. Accept more maintenance of reconnect/segmenter logic. |
| H.264 passthrough | H.265→H.264 transcode (libx264 veryfast) | Only if camera is physically locked to H.265 output. Sizes VPS at ≥2 vCPU.                                          |
| Fastify           | Stock `node:http`                        | Ultra-minimal dep surface; acceptable because only 2–3 routes.                                                      |
| Fastify           | Hono                                     | Cross-runtime portability (we don't need it here).                                                                  |
| Cache Rules       | Cloudflare Stream                        | If/when we hit ToS concerns or want ABR for free. Trade: reintroduces vendor lock-in we just removed.               |

---

## What NOT to Use

| Avoid                                                   | Why                                                                                        | Use Instead                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `fluent-ffmpeg` (`2.1.3`, 2024-05)                      | Unmaintained, maintainers-wanted, >22 months stale as of 2026-04.                          | `execa@9` spawning `ffmpeg` directly, or skip by using MediaMTX.                                            |
| `node-media-server` (`4.2.4`)                           | RTMP-publisher-server, no RTSP client. Wrong shape for "pull RTSP, emit HLS".              | MediaMTX.                                                                                                   |
| `node-rtsp-stream` / `rtsp-server` / `node-rtsp-server` | Tiny demo-grade wrappers, unmaintained, no HLS muxing.                                     | MediaMTX.                                                                                                   |
| Docker / k8s / nomad                                    | Milestone explicitly excludes. Single long-running Node process + MediaMTX child.          | systemd on VPS.                                                                                             |
| Redis / PostgreSQL / message queue                      | No shared state; single VPS.                                                               | In-memory state in Node; KV only if cross-process signalling with `web` is ever needed (not in v1.2 scope). |
| PM2 / forever / nodemon-prod                            | systemd already owns the Node process; Node owns MediaMTX. Extra layer adds failure modes. | systemd `Restart=always`.                                                                                   |
| `express`                                               | Legacy perf/types, no reason to pick in 2026.                                              | Fastify 5 or raw `node:http`.                                                                               |
| TypeScript return-type annotations                      | Per user rules (explicit).                                                                 | Let inference do its job.                                                                                   |

---

## Stack Patterns by Variant

**If the camera cannot be set to H.264:**

- Add a MediaMTX `runOnReady` action OR switch MediaMTX config to use ffmpeg as a source transcoder: `source: ffmpeg:rtsp://...#video=h264&audio=aac` (go2rtc pattern; MediaMTX supports `source: ffmpeg:…` via command config). Cost: sustained ~1 vCPU for 2560×1920@30fps H.265→H.264 with `libx264 -preset veryfast`.
- Size VPS at ≥2 vCPU and ≥2 GB RAM.

**If we later want sub-2s glass-to-glass latency:**

- Flip `hlsVariant: lowLatency` on MediaMTX (already suggested above).
- Ensure Cloudflare does not buffer — use `CDN-Cache-Control: no-store` on `*.part` partial segments if needed. Document deferred.

**If Cloudflare ToS path changes to R2-backed origin:**

- Add a post-segment hook (`runOnSegmentComplete` in MediaMTX) pushing segments to R2.
- The Node supervisor gets thicker; re-evaluate at that time.

---

## Version Compatibility

| Package A                       | Compatible With                            | Notes                                                                           |
| ------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------- | --- | ---------------------------------- |
| fastify@5                       | pino@9 ∥ pino@10                           | Fastify 5 declares `pino: ^9.14.0                                               |     | ^10.1.0` in its deps. Use pino 10. |
| fastify@5                       | node@20+                                   | Node 22 LTS is current target.                                                  |
| MediaMTX v1.17.1                | ffmpeg 5+ (only if `source: ffmpeg:` used) | System ffmpeg; version not pinned by MediaMTX.                                  |
| vidstack (web client, existing) | H.264 + AAC HLS                            | Native path — no changes needed when we swap origins from CF Stream to our VPS. |

---

## Sources

- `/bluenviron/mediamtx` (Context7) — HLS config, LL-HLS variant, API endpoints — HIGH confidence.
- GitHub `bluenviron/mediamtx` releases API — v1.17.1 (2026-03-31) — HIGH confidence.
- `/illuspas/node-media-server` (Context7) — confirmed RTMP-publisher-only, no RTSP client — HIGH confidence.
- npm registry `node-media-server` v4.2.4 (2026-01-02) — HIGH confidence.
- `/alexxit/go2rtc` (Context7) — RTSP source, HLS API patterns — HIGH confidence.
- GitHub `AlexxIT/go2rtc` releases API — v1.9.14 (2026-01-19) — HIGH confidence.
- npm registry `fastify` v5.8.5 (2026-04-14) — HIGH confidence.
- npm registry `hono` v4.12.14 (2026-04-15) — HIGH confidence.
- npm registry `pino` v10.3.1 (2026-02-09) — HIGH confidence.
- npm registry `fluent-ffmpeg` v2.1.3 (2024-05-19, maintainers-wanted notice) — HIGH confidence (unmaintained).
- caniuse.com/hevc — browser HEVC support matrix Apr 2026 — HIGH confidence (Chrome/Firefox/Edge all ≤ "partial", Safari "full").
- Cloudflare docs `cache/concepts/cdn-cache-control` and `cache/how-to/cache-rules/settings/` — TTL semantics + `CDN-Cache-Control` header — HIGH confidence.
- Existing codebase: `packages/relay/src/ffmpeg.ts`, `packages/relay/src/state-machine.ts` — supervision pattern to port.

---

_Stack research for: self-hosted HLS origin Node service (packages/stream, v1.2)_
_Researched: 2026-04-20_
