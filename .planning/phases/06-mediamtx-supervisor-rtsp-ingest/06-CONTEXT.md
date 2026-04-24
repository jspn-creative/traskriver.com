# Phase 6: MediaMTX Supervisor + RTSP Ingest - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Hang the MediaMTX supervisor onto the Phase 5 skeleton. The Node process spawns MediaMTX as a child, keeps the RTSP→HLS pipeline alive 24/7 with exponential backoff + stall watchdog + codec guard, and configures MediaMTX for H.264 passthrough HLS on tmpfs. MediaMTX serves public HLS on its own HTTP origin port; Hono continues to serve only `/health`.

Out of scope for Phase 6: full `/health` payload (Phase 7), ops-only binding for `/health` (Phase 7), systemd unit + tmpfs `RuntimeDirectory` + TLS + DNS (Phase 8), camera-side config + DDNS + CVE pre-flight (Phase 8), web client swap + cleanup (Phase 9), relay/shared purge (Phase 7/9).

</domain>

<decisions>
## Implementation Decisions

### MediaMTX Lifecycle (spawn, config, I/O)

- **Binary resolution:** `MEDIAMTX_BIN` env (default `mediamtx`) → assume on PATH. Phase 6 is code-only; binary placement, pinning, and checksum are Phase 8 infra concerns. No vendored binary in repo, no tarball download at boot.
- **Config file: generated dynamically at boot.** Zod env is the single source of truth; supervisor writes `${HLS_DIR}/../mediamtx.yml` (or a supervisor-owned temp path) on spawn, passes it as `mediamtx <path>`. Segment duration, GOP, playlist window, cache headers are literals in the generator — they're locked by success criteria and must not drift from env.
- **Config shape (passthrough HLS — MediaMTX v1.17.x syntax, per 06-RESEARCH):** single path `trask` with `source: ${RTSP_URL}`, `sourceOnDemand: no` (always pulling), `rtspTransport: tcp` (reliable over the public net — note: `sourceProtocol` is the obsolete key, v1.17 renamed it to `rtspTransport` as a per-path option). HLS enabled globally with `hls: yes`, `hlsAddress: :${MEDIAMTX_HLS_PORT}`, `hlsSegmentDuration: 2s`, `hlsSegmentCount: 6`, `hlsVariant: mpegts` (H.264 passthrough), `hlsDirectory: ${HLS_DIR}`, **`hlsAlwaysRemux: yes`** (keeps muxer warm so first-viewer latency after a restart stays low). API enabled on `${MEDIAMTX_API_PORT}` (`api: yes`, `apiAddress: :${MEDIAMTX_API_PORT}`). No RTMP, no SRT, no WebRTC, no recordings. Pin MediaMTX v1.17.1 (released 2026-03-31) — gives the `tracks2` API field and stable config schema.
- **Child I/O:** MediaMTX stdout+stderr captured by `child_process.spawn` with `stdio: ['ignore', 'pipe', 'pipe']`. Each stream line-buffered and forwarded to `log.child({ component: 'mediamtx' })` at `info` (stdout) / `warn` (stderr). No file logging; journald picks it up from the Node process's stdout in Phase 8.
- **Spawn API:** Node `child_process.spawn` (not `exec`, not `execa`). Zero extra deps. Detached: **no** — child dies with parent.
- **Cache headers are NOT MediaMTX's job (scope shift after research).** MediaMTX's `gohlslib` hardcodes `.m3u8: no-cache` and `.ts: max-age=3600` with no config override. Cache-header rewriting (`public, max-age=1` on `.m3u8`, `public, max-age=86400, immutable` on `.ts`) is deferred to Phase 8's reverse proxy (OpenLiteSpeed primary, Caddy fallback). Phase 6 criterion #4 was amended in ROADMAP to drop the cache-header clause; Phase 6 only validates manifest structure (2s segment duration, 6-segment window). MediaMTX's built-in HLS server on `${MEDIAMTX_HLS_PORT}` serves bytes directly in Phase 6; Phase 8 puts OLS in front to terminate TLS and rewrite headers.

### Backoff + Lifecycle

- **Supervisor owns restart state in-process.** Simple class with `currentBackoffMs`, `firstReadyAt`, `restartTimer`, `child`. No external state store in Phase 6.
- **Backoff: 1s → 2s → 4s → 8s → 16s → 30s (cap), reset to 1s after 60s clean uptime** (clean = child continuously running AND MediaMTX API `ready:true`).
- **Graceful shutdown:** on SIGTERM/SIGINT, supervisor tears down MediaMTX first: send SIGTERM to child, 10s grace timer, then SIGKILL if still alive. Only after child is gone does the Hono server close and process exit.
- **Abnormal child exit:** logged at `warn` with exit code + signal; triggers backoff restart (not fatal). Fatal is only: codec mismatch (see below) or config/env validation failure at boot.

### Stall Watchdog

- **Poll interval: 5s.**
- **Threshold: 75s** (middle of the 60–90s requirement range — responsive without being jittery).
- **Signal:** poll MediaMTX API path info every 5s; track `(bytesReceived, ready)`. Stall = **15 consecutive polls (75s) with `Δbytes == 0` while `ready: true`**.
- **`ready: false` gates out stall detection:** a disconnected/reconnecting stream is a reconnect event, not a stall — stall watchdog only fires when MediaMTX thinks the source is healthy but bytes aren't moving.
- **On stall:** log `warn` with last-byte-progress timestamp, trigger a supervised restart (SIGTERM→10s→SIGKILL the child, then backoff-spawn). Restart counter increments (Phase 7 surfaces this in `/health`).

### Codec Guard

- **Check once: at first transition to `ready`.** Supervisor queries MediaMTX API for the ingest track codec via `GET /v3/paths/get/trask` (use `tracks2` array from v1.17+ — each entry has `type`, e.g. `"H264"` / `"H265"`). Compare with strict equality: `codec === 'H264'` (PascalCase; per research against `internal/formatlabel/label.go`). If not `H264`, log `FATAL: camera codec is {actual}, expected H264` and **exit the process non-zero** (systemd won't restart-loop it: rely on `StartLimitBurst` in Phase 8 to eventually stop trying).
- **No periodic re-check.** Camera reconfiguration mid-flight is not a supported scenario — operator must change camera config, then restart the service.
- **No retry, no loop, no persistent `codec_mismatch` state machine entry.** Fatal is fatal. The `codec_mismatch` HealthStatus value stays in the enum for Phase 7's `/health` payload but Phase 6 exits before `/health` can observe it — any caller reading `/health` during the brief window just sees `starting`. That's fine.

### Supervisor State Machine (internal)

- States: `spawning → waitingReady → ready ⇌ stalled → spawning (restart)` · `→ shuttingDown (SIGTERM received)` · `→ fatal (codec mismatch; process exits)`.
- Maps to `HealthStatus` enum (defined Phase 5):
  - `spawning | waitingReady` → `starting`
  - `ready` → `ready`
  - `stalled | restart-pending` → `degraded`
  - codec mismatch → process exits (brief `/health` window shows whatever was last; not guaranteed)
- Phase 6 wires the state, but `/health` payload beyond `{ status }` is still Phase 7. **Phase 6 is allowed to update the status field** (so `/health` returns `{ status: "ready" }` when MediaMTX is healthy), but no new keys.

### Phase 6 Config Surface (new env vars)

Additions to the zod schema in `packages/stream/src/config.ts`:

- `RTSP_URL` — `z.string().url()`, required, no default. Single full URL including credentials (e.g., `rtsp://rtspuser:${PASS}@cam.ddns.example:554/h264Preview_01_main`). Simpler than split host/user/pass/path fields; DDNS/port changes rarely; creds are already embedded per Reolink convention.
- `MEDIAMTX_API_PORT` — `z.coerce.number().int().positive().default(9997)`.
- `MEDIAMTX_HLS_PORT` — `z.coerce.number().int().positive().default(8888)`.
- `HLS_DIR` — `z.string().default('/run/stream/hls')`. Defaults match Phase 8's planned `RuntimeDirectory=stream`; local dev overrides to e.g. `./run/hls`.
- `MEDIAMTX_BIN` — `z.string().default('mediamtx')`. Resolvable binary name or absolute path.
- **Logging redaction:** `RTSP_URL` contains a password; Pino must redact. Add `pino({ redact: ['RTSP_URL', 'config.RTSP_URL', '*.password'] })` or log a sanitized version (`rtspUrl: redactCredsFromUrl(config.RTSP_URL)`) when reporting boot config. Never log raw `RTSP_URL`.

### Directory Layout (additions)

```
packages/stream/src/
├── index.ts                    (existing — extend boot to also start supervisor)
├── config.ts                   (existing — extend zod schema with new vars)
├── logger.ts                   (existing — add redaction)
├── server.ts                   (existing — /health returns live supervisor status)
├── supervisor.ts               (new — MediaMTX process supervisor, state machine, backoff)
├── mediamtx-config.ts          (new — generate MediaMTX yaml from env)
├── mediamtx-api.ts             (new — poll MediaMTX API for ready/bytes/codec)
└── watchdog.ts                 (new — stall watchdog tied to supervisor)
```

Planner has discretion to split further or merge `watchdog.ts` into `supervisor.ts` if the file stays small.

### Testing / Verification Approach

- **No unit test framework added.** Per user preference ("Do NOT add unit tests unless explicitly asked"). Verification leans on the Phase 6 success criteria run manually:
  1. `kill -9 $(pgrep mediamtx)` → supervisor respawns with backoff.
  2. Unplug camera ≥90s → supervisor exits `ready`, re-enters on reconnect, manifest has `EXT-X-DISCONTINUITY`.
  3. Force H.265 on camera → boot logs fatal, process exits non-zero.
  4. `curl http://localhost:8888/trask/index.m3u8` → manifest + cache headers.
  5. HLS files under `${HLS_DIR}`.
- **Local verification without a real camera is acceptable:** use ffmpeg to publish an H.264 RTSP stream to a local RTSP relay, OR point `RTSP_URL` at the production camera from a dev laptop. Planner picks what's practical for the execution environment.

### Claude's Discretion

- Exact poll-interval/backoff constants (as consts at top of `supervisor.ts`, not env — they're locked by requirements, not operator-tunable).
- Whether `mediamtx-api.ts` uses `fetch` (Node 22 has it native) or a minimal wrapper.
- Line-buffering strategy for child stdout (readline vs manual split on `\n`).
- How to map MediaMTX stderr lines to Pino levels (heuristic parse or all `warn`).
- Whether `supervisor.ts` is a class or a closure-based factory.
- MediaMTX yaml generator: literal template string vs object-serialized-to-yaml (if yaml dep is added, justify; prefer hand-written template — the config is ~20 lines and stable).

### Folded Todos

None — no pending todos matched this phase.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase inputs

- `.planning/ROADMAP.md` §"Phase 6: MediaMTX Supervisor + RTSP Ingest" — 5 success criteria
- `.planning/REQUIREMENTS.md` §STRM-02 through §STRM-07 — the six requirements this phase satisfies
- `.planning/PROJECT.md` §"Context", §"Constraints" — target pipeline, camera specs (Reolink RLC-510WA, H.264/H.265 capable), ~40Mbps sustained home upload ceiling
- `.planning/STATE.md` — current milestone position

### Phase 5 foundation (what to extend, what not to break)

- `.planning/phases/05-packages-stream-skeleton/05-CONTEXT.md` — toolchain lockdown (Node 22, `tsc` emit, `node --experimental-strip-types --watch` dev, Hono, Pino, zod, one-mode), directory layout, HealthStatus enum
- `.planning/phases/05-packages-stream-skeleton/05-VERIFICATION.md` — green skeleton state Phase 6 starts from
- `packages/stream/src/config.ts` — zod schema to extend
- `packages/stream/src/logger.ts` — Pino factory; add redaction here
- `packages/stream/src/index.ts` — boot sequence; supervisor start wires in here
- `packages/stream/src/server.ts` — `/health` route; status field becomes dynamic

### Downstream (forward-compat choices)

- `.planning/ROADMAP.md` §"Phase 7" — `/health` payload shape Phase 6's supervisor must expose data for (`rtspConnected`, `codec`, `lastSegmentWrittenAgoMs`, `restartsLast1h`, `uptimeMs`) — Phase 6 tracks these internally, Phase 7 exposes them
- `.planning/ROADMAP.md` §"Phase 8" — systemd `RuntimeDirectory=stream` sets tmpfs mount at `/run/stream`; default `HLS_DIR=/run/stream/hls` aligns

### MediaMTX (external docs — use Context7 / latest docs at plan time)

- MediaMTX docs: `https://github.com/bluenviron/mediamtx` — config reference for HLS muxer, RTSP source, API endpoints
- MediaMTX API: `http://localhost:9997/v3/paths/list` and `http://localhost:9997/v3/paths/get/{name}` for ready/bytesReceived/codec tracking
- HLS RFC 8216 §4.3.3 — `EXT-X-DISCONTINUITY` semantics

### Workspace conventions

- `.planning/codebase/CONVENTIONS.md` — Prettier config (tabs, single quotes, `trailingComma: none`, printWidth 100), no ESLint, `tsc --noEmit` as type gate
- `.planning/codebase/STACK.md` — Bun as package manager, Turbo for task orchestration, strict ES2022 ESM
- `AGENTS.md` §"Learned User Preferences" — no unit tests unless asked, no explicit return types, Tailwind v4 (N/A for this package), concise edits

### Relay (reference only — do NOT port Bun code)

- `packages/relay/src/index.ts` — pattern reference for child-process supervision and signal handling (but uses `Bun.spawn` / Bun stdlib — rewrite for Node `child_process.spawn`)
- `packages/relay/src/ffmpeg.ts` — pattern reference for child I/O plumbing (Bun-specific; adapt to Node streams)
- `packages/relay/src/state-machine.ts` — pattern reference for a small in-process state machine (plain TS; adaptable)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`packages/stream/src/config.ts`** — extend the existing zod schema; no new file needed for env.
- **`packages/stream/src/logger.ts`** — single Pino factory; add redaction options here so every child logger inherits them.
- **`packages/stream/src/server.ts`** — existing `/health` route; supervisor exposes a `getStatus()` accessor, server reads it on each request (no globals, no singletons required — wire via closure or DI through `createApp({ getStatus })`).
- **`packages/relay/src/state-machine.ts`** — pattern reference for clean TS state transitions with invalid-transition logging; adapt the idea, not the Bun imports.

### Established Patterns

- **Workspace package shape** — `packages/stream/` follows `packages/relay/` layout; Phase 6 additions stay within `src/`.
- **Boot = parse env → build logger → build app → start server.** Phase 6 inserts `supervisor.start()` between "build app" and "start server" (or concurrently with server start), and shutdown tears down supervisor before Hono.
- **Strict TS, no ESLint, Prettier-only style gate.** New files obey this.
- **No explicit return types on functions** unless crypto/contract requires it (user rule).
- **Child logger per component.** Phase 6 adds `supervisor`, `watchdog`, `mediamtx-api`, `mediamtx` (for child process output).

### Integration Points

- `packages/stream/src/index.ts` — main wiring point: instantiate supervisor after logger/config, before `serve()`; shutdown handler tears it down first.
- `packages/stream/src/server.ts` — `createApp()` takes a `getStatus: () => HealthStatus` argument so `/health` reflects live supervisor state without globals.
- `packages/stream/src/config.ts` — zod schema grows by 5 keys; `loadConfig()` signature unchanged.
- No changes to `packages/web`, `packages/relay`, `packages/shared`, `wrangler.jsonc`, `turbo.json`, or root `package.json` in Phase 6.

### Anti-patterns to Avoid

- **No `Bun.spawn`, no `Bun.serve`, no `bun-types`.** Phase 5 locked Node-only; Phase 6 holds the line.
- **No global singletons** for supervisor state — pass accessors into `createApp`, keep testability options open.
- **No yaml library** unless strictly necessary (MediaMTX config is ~20 stable lines; a literal template string is cleaner).
- **No new HTTP server on the HLS port** — MediaMTX serves HLS; Node only serves `/health`. Success criterion #5 is explicit.
- **No logging of raw `RTSP_URL`** — it contains the camera password. Redact at Pino level.
- **No watchdog re-entry** during backoff — stall detector pauses while child is down/spawning.
- **No codec re-check loop** — check once at first `ready`, exit fatal on mismatch. (User explicitly locked this.)

</code_context>

<specifics>
## Specific Ideas

- **"Codec guard: once is fine, fatal exit, no reconfigurations mid-flight."** (User lock.) Camera codec is operator-set and static; a mismatch means operator error, not a recoverable runtime condition.
- Phase 6 is Node-side orchestration; MediaMTX does the actual RTSP→HLS mux, HTTP serving, and cache-header emission. Keep the Node code thin: spawn, watch, restart, guard codec, expose status.
- The HLS port (8888) is the public-facing port in Phase 8 via Cloudflare; Hono's PORT (8080) is ops-only. Don't conflate them.

</specifics>

<deferred>
## Deferred Ideas

- Full `/health` payload (`rtspConnected`, `codec`, `lastSegmentWrittenAgoMs`, `restartsLast1h`, `uptimeMs`) and ops-only binding — **Phase 7** (supervisor will track this state in Phase 6, but not expose it)
- systemd unit, `RuntimeDirectory=stream` tmpfs mount, TLS, journald retention tuning — **Phase 8**
- MediaMTX binary provisioning (apt / tarball v1.17.1 / checksum) — **Phase 8**
- DNS (`stream.traskriver.com`, orange-cloud proxy), Let's Encrypt cert + auto-renew — **Phase 8**
- **HLS cache-header rewriting** (OpenLiteSpeed primary, Caddy fallback; rewrites `.m3u8` → `Cache-Control: public, max-age=1` and `.ts` → `public, max-age=86400, immutable`) — **Phase 8** (MediaMTX cannot emit these natively)
- Camera DDNS, RTSP-user account, port-forward, CVE pre-flight, `FIRMWARE.md` — **Phase 8**
- Web client swap to new HLS URL, state-machine collapse, `degraded` overlay UX — **Phase 9**
- Relay/demand/JWT deletion, shared-types purge, wrangler binding cleanup — **Phases 7 & 9**

</deferred>

---

_Phase: 06-mediamtx-supervisor-rtsp-ingest_
_Context gathered: 2026-04-20_
