# Architecture Research — v1.2 Self-Hosted HLS Origin

**Domain:** Monorepo with Cloudflare Workers web app + new always-on Node VPS origin; retiring an on-demand Pi relay and Cloudflare Stream dependency.
**Researched:** 2026-04-20
**Confidence:** HIGH for component boundaries and cutover strategy (grounded in existing code in `packages/web`, `packages/relay`, `packages/shared`, plus STACK.md + FEATURES.md findings). MEDIUM for DDNS/port-forward behavior (camera + router configured by user, assumptions stated). Cloudflare-ToS-on-video flagged to `PITFALLS.md` as out-of-architecture blocker.

---

## TL;DR for the Roadmap Author

1. **`packages/stream` is the only new package.** It supervises MediaMTX on a VPS, serves HLS on `:8888`, and serves `/health` on `:8080`. Node supervisor is small (~150–250 LOC).
2. **Cutover is atomic-per-deploy, with a feature flag.** Phase-order: build `packages/stream` → provision VPS + Cloudflare cache rules → flip `PUBLIC_STREAM_HLS_URL` via env + delete demand/JWT code in the **same web deploy**. Rollback = revert the deploy (git + `wrangler rollback`) + keep CF Stream live input alive for 7 days.
3. **Deletion list is bigger than the addition list.** Web loses `/api/stream/demand`, `/api/relay/status`, the remote `getStreamInfo` JWT signer, and most of `+page.svelte`'s state machine. `packages/shared` loses the relay/demand/JWT types. `packages/relay` stays in-repo, stops deploying to Pi after cutover.
4. **The `packages/stream` internal shape mirrors `packages/relay`'s supervisor pattern** (`state-machine.ts` → `supervisor.ts`, `ffmpeg.ts` → `mediamtx.ts`, `health-server.ts` → `http-server.ts`, `logger.ts` unchanged). Familiar territory, no novel architecture.

---

## End-to-End System Overview

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                             CAMERA NETWORK (home)                              │
│   ┌────────────────────┐                                                       │
│   │ 2560x1920 RTSP cam │── RTSP (TCP 554, H.264) ──┐                           │
│   │ built-in DDNS      │                           │                           │
│   └─────────┬──────────┘                           │                           │
│             │ DDNS hostname (e.g. trask-cam.ddns)  │                           │
│             │ Router: 554/tcp forwarded only       │                           │
└─────────────┼──────────────────────────────────────┼───────────────────────────┘
              │                                      │
              │ public internet (pull)               │
              ▼                                      ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                          VPS (packages/stream, Node 22)                        │
│   ┌──────────────────────────────────────────────────────────────────────┐    │
│   │ Node supervisor                                                       │    │
│   │   ┌───────────────┐   spawn/restart/backoff   ┌─────────────────────┐ │    │
│   │   │ supervisor.ts │──────────────────────────▶│ MediaMTX (child)    │ │    │
│   │   └───────┬───────┘                           │ RTSP client (TCP)   │ │    │
│   │           │                                   │ HLS muxer :8888     │ │    │
│   │           │                                   │ API :9997 (local)   │ │    │
│   │           │                                   └──────────┬──────────┘ │    │
│   │   ┌───────▼────────┐  reads /v3/paths/get      │ writes   │           │    │
│   │   │ http-server.ts │◀─────────────────────────┘ segments │           │    │
│   │   │  Fastify :8080 │                              to tmpfs│           │    │
│   │   │   GET /health  │                           /var/lib/   │           │    │
│   │   └───────┬────────┘                           stream/hls/ │           │    │
│   │           │                                                │           │    │
│   │   ┌───────▼────────┐                                       │           │    │
│   │   │ pino JSON logs │───▶ journald ───▶ journalctl          │           │    │
│   │   └────────────────┘                                       │           │    │
│   └────────────────────────────────────────────────────────────┼───────────┘    │
│                                                                 │                │
│   systemd (Restart=always)                                      │                │
└──────────────────────────┬──────────────────────────────────────┼────────────────┘
                           │                                      │
                           │                                      │
            ops probe      │       public HLS (GET)               │
            (curl/uptime)  │       m3u8 + ts segments             │
                           │                                      │
                           ▼                                      ▼
               ┌──────────────────────┐       ┌─────────────────────────────┐
               │ ops.stream.trask…    │       │ CLOUDFLARE (orange cloud)   │
               │ :8080 /health        │       │ stream.traskriver.com       │
               │ (Tailscale-only,     │       │ Cache Rules:                │
               │  not public; see     │       │   *.m3u8  → TTL 1s          │
               │  "/health surface")  │       │   *.ts    → TTL 1d immut.   │
               └──────────────────────┘       │ SSL: Full (strict)          │
                                              │ Transform: no minify/rocket │
                                              └──────────────┬──────────────┘
                                                             │
                                                             │ HTTPS HLS
                                                             ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                 packages/web  (SvelteKit on Cloudflare Workers)                │
│   ┌──────────────────────────────────────────────────────────────────────┐    │
│   │ +page.svelte (collapsed state machine: connecting/viewing/degraded/   │    │
│   │                                         error)                        │    │
│   │   VideoPlayer.svelte (vidstack + hls.js)                              │    │
│   │        │                                                               │    │
│   │        │ PUBLIC_STREAM_HLS_URL = https://stream.traskriver.com/trask/  │    │
│   │        │                        index.m3u8                             │    │
│   │        ▼                                                               │    │
│   │   native fetch ──────────────────────────────────────────────────────┐ │    │
│   └───────────────────────────────────────────────────────────────────────┘    │
│                                                                                │
│   API routes (after v1.2 cutover):                                              │
│     /api/stream/demand   ❌ DELETED                                             │
│     /api/relay/status    ❌ DELETED                                             │
│     /api/test-kv         ❌ DELETED (debug-only, no longer needed)              │
│     stream.remote.ts     ❌ DELETED (CF Stream JWT signer)                      │
│     (no /api/stream/jwt ever existed — JWT signing lived in stream.remote.ts)   │
│     (no new route needed for /health — browser does not need to see origin)    │
└───────────────────────────────────────────────────────────────────────────────┘
                                       ▲
                                       │ browser (vidstack → hls.js → CF CDN)
                                       │
                                 ┌─────┴─────┐
                                 │  Viewer   │
                                 └───────────┘
```

### `/health` surfacing

- **Origin exposes** `/health` on Fastify `:8080` on the VPS, **behind an ops-only path**. Recommended: **not fronted by Cloudflare orange-cloud**; bind Fastify to the Tailscale-assigned interface only (or the management VLAN IP), or expose on a distinct hostname like `ops.stream.traskriver.com` set to `DNS only` (grey cloud) with Cloudflare Access in front. See PITFALLS for why.
- **Who polls `/health`:**
  - `systemd` does NOT poll (it uses process-exit signals + `Restart=always`).
  - The Node supervisor polls **MediaMTX's own `:9997/v3/paths/get/trask`** internally (every 30s, see STACK.md). It does **not** poll its own Fastify.
  - **Optional external uptime monitor** (UptimeRobot / Better Stack on free tier) hits `/health` every 1–5 minutes. Recommended but not required for v1.2 MVP.
  - **Web does NOT poll origin `/health` directly.** Instead, `VideoPlayer.svelte` derives the `degraded` state from **HLS manifest freshness**: if the playlist `#EXT-X-MEDIA-SEQUENCE` hasn't advanced in >10s during playback, flip to `degraded`. This avoids the web app making cross-origin calls to a second hostname and avoids reintroducing server-to-origin heartbeats over KV.
  - **Rationale:** the manifest IS the liveness signal the viewer cares about. A green `/health` with stale segments is still a bad stream. Reading MEDIA-SEQUENCE is zero-cost because hls.js already parses it.

### What happens to the existing API routes

| Route / file                                                 | Current purpose                                                                                                                     | v1.2 disposition                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `packages/web/src/routes/api/stream/demand/+server.ts`       | POST: viewer registers demand; GET: relay polls to know whether to stream                                                           | **DELETE** — no demand, no polling                                                        |
| `packages/web/src/routes/api/relay/status/+server.ts`        | Relay POSTs state; web GETs state for UI                                                                                            | **DELETE** — relay isn't running, UI uses manifest freshness instead                      |
| `packages/web/src/routes/api/test-kv/+server.ts`             | Dev-only KV smoke test                                                                                                              | **DELETE** — KV is unused after cutover                                                   |
| `packages/web/src/routes/stream.remote.ts` (`getStreamInfo`) | Server remote function: builds signed Cloudflare Stream JWT + m3u8 URL                                                              | **DELETE** entire file. Replace call sites with a plain `PUBLIC_STREAM_HLS_URL` env read. |
| `packages/web/src/routes/api/stream/jwt/...`                 | (Does not exist in current code — the question assumed a dedicated route. In reality, JWT signing is inline in `stream.remote.ts`.) | N/A; see above                                                                            |
| `packages/web/src/hooks.server.ts`                           | Current logic                                                                                                                       | Review: may need trimming if it references KV bindings that no longer matter              |

**Retained web API:** none related to streaming. Keep whatever analytics/PostHog server-side paths exist.

---

## Component Responsibilities (Post-Cutover)

| Component                               | Responsibility                                                                                                   | Implementation                                                                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Camera (RTSP source)**                | Produce H.264 MPEG-TS at 3–6 Mbps CBR, 2s GOP, via DDNS + port-forward (TCP 554 only)                            | Hardware + firmware config (user-owned)                                                                                                                  |
| **DDNS**                                | Resolve `cam.ddns.example` to home WAN IP, auto-update on IP change                                              | Camera's built-in DDNS client OR router's client (user-owned; note in README only)                                                                       |
| **VPS `packages/stream`**               | Always-on RTSP ingest, HLS mux, HTTP origin, `/health`, structured logs, graceful restart with DISCONTINUITY     | Node 22 supervisor + MediaMTX v1.17.1 child, systemd unit, tmpfs for segments                                                                            |
| **Cloudflare (non-Stream)**             | Orange-cloud proxy for `stream.traskriver.com`, cache rules for `.m3u8`/`.ts`, TLS termination, DDoS/rate shield | CF dashboard (config-only; no code). See PITFALLS for ToS blocker.                                                                                       |
| **`packages/web` (Cloudflare Workers)** | SSR page, player, simplified state machine, PostHog, weather/USGS (unchanged)                                    | SvelteKit app; streams-related code is subtractive                                                                                                       |
| **`packages/shared`**                   | Types/constants shared between remaining consumers                                                               | Trimmed: only non-relay/demand/JWT types remain; could shrink to near-empty                                                                              |
| **`packages/relay` (retired)**          | Documented cold fallback only. Not deployed.                                                                     | Repo-only; README updated to reflect its status                                                                                                          |
| **Cloudflare KV (`RIVER_KV`)**          | Demand key + relay-status key                                                                                    | **No longer written or read by the active path.** Leave binding in `wrangler.jsonc` for the cold-fallback case; document that the keys expire naturally. |

---

## `packages/stream` Internal Architecture

### Recommended directory layout

```
packages/stream/
├── src/
│   ├── index.ts              # entry: validates env, boots supervisor + http server
│   ├── config.ts             # zod schema over process.env → typed Config object
│   ├── supervisor.ts         # spawn/restart/backoff MediaMTX child (mirrors relay/state-machine)
│   ├── mediamtx.ts           # execa wrapper; stderr → pino; kill escalation (mirrors relay/ffmpeg)
│   ├── mediamtx-client.ts    # tiny HTTP client for MediaMTX :9997 API (health probe)
│   ├── http-server.ts        # Fastify :8080 /health (mirrors relay/health-server)
│   ├── logger.ts             # pino JSON, pino-pretty in dev (mirrors relay/logger)
│   └── types.ts              # internal types (Health, SupervisorState)
├── config/
│   ├── mediamtx.yml.tpl      # MediaMTX config template (env-substituted at boot)
│   └── stream.service        # systemd unit (user-owned at deploy, shipped as reference)
├── scripts/
│   └── render-config.ts      # reads env → writes /opt/stream/mediamtx.yml
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

**Rationale for multi-module over single-file:**

- Mirrors `packages/relay/src/` structure exactly (supervisor ↔ state-machine, mediamtx ↔ ffmpeg, http-server ↔ health-server, logger ↔ logger). Onboarding cost ≈ zero.
- Each file has one clear reason to change. Total ~250 LOC, but split into five files is easier to unit-reason about than a 250-LOC `index.ts`.
- Enables shipping `mediamtx-client.ts` as a standalone testable module (MediaMTX API contract is narrow: 3 endpoints).
- Config rendering lives under `scripts/` because it runs at deploy-time, not at runtime — keeps runtime surface small.

### Supervisor state machine

Smaller than the relay's (always-on, no demand):

```
starting ──MediaMTX spawn OK──▶ ready ──API probe fail x3──▶ degraded
   │                              │                             │
   │                              │                             │
   └──MediaMTX spawn fail────▶ backoff ◀──restart──────────────┘
                                 │
                                 └── retry: 1s → 2s → 4s → 8s → 30s cap
                                     reset to 1s on 60s clean uptime
```

Note: `ready` vs `degraded` is internal to the supervisor. The HLS origin may still be serving stale-but-valid segments during `degraded` (which is exactly the viewer-side `degraded` story).

### HLS files on disk

- **Location:** `/var/lib/stream/hls/` on **tmpfs** (declared in systemd unit via `RuntimeDirectory=stream` or a `mount` unit). Size: 256 MB tmpfs is ample (8 segments × 2s × ~1.5 MB/seg = ~12 MB steady-state, plus headroom).
- **Why tmpfs:** segments are ephemeral by design; disk IO is avoided; restart wipes old segments so we don't accidentally serve stale content with new sequence numbers.
- **Why not persistent:** we don't do DVR in v1.2; persistent storage would risk post-restart confusion about segment numbering across restarts.
- **Cleanup:** MediaMTX handles segment rotation natively (`hlsSegmentCount: 7`). Tmpfs disappears on reboot. No cron required.

### Logging / error surfaces

- **Process logs:** pino JSON to stdout → systemd journald → `journalctl -u stream -f`. User-owned log retention config (systemd `SystemMaxUse=500M` recommended).
- **MediaMTX logs:** forwarded through the supervisor. MediaMTX's native `logFormat: json` to stdout captured by execa, parsed, republished via pino at mapped levels (`info`/`warn`/`error`).
- **Error surfaces for ops:**
  - systemd: exit code logged by journald.
  - `/health` response includes `lastError` (last non-recovered MediaMTX restart reason) and `restartsLast1h`.
  - Optional: PostHog `stream_origin_event` captures for supervisor transitions (mirrors existing analytics pattern). Out of MVP scope; flag as nice-to-have.

### Graceful shutdown + restart without viewer disruption

- On `SIGTERM`: supervisor sends `SIGTERM` to MediaMTX (10s grace), then `SIGKILL`. Fastify flushes `/health` as `{ status: 'shutting_down' }` first.
- On MediaMTX crash mid-stream: supervisor restarts. MediaMTX emits new segments with a fresh sequence and `#EXT-X-DISCONTINUITY` tag at the top of the new fragment sequence (MediaMTX does this automatically on its internal muxer restart; verify behavior in phase plan). hls.js handles discontinuity natively.
- **Viewer experience on a 5–10s origin restart:** player exhausts its in-memory buffer (3–5 segments ≈ 6–10s), CF serves cached `.ts` briefly, then either (a) new segments arrive within buffer window → seamless continuation, or (b) buffer drains → hls.js shows brief stall → resumes on new manifest. This is the expected behavior; document in ops README.
- **Viewer-count-preserving deploys:** for the rare planned deploy, the supervisor should implement a `drain` step: stop MediaMTX, wait ~8s (covers a player's buffer), then let systemd restart. Non-blocking for MVP; add if a cleaner deploy story is wanted.

### Single-file vs multi-module: **multi-module** (recommended above)

- Pure readability win. The scary parts (execa spawn, backoff, SIGTERM dance) benefit from living in their own file.
- Unit-testing supervisor transitions (mirrors `state-machine.test.ts` in relay) is trivial once `mediamtx.ts` is mockable.

---

## Integration Points by Package

### `packages/web`

**New env/config:**

| Variable                | Scope                | Value                                            | Purpose                           |
| ----------------------- | -------------------- | ------------------------------------------------ | --------------------------------- |
| `PUBLIC_STREAM_HLS_URL` | `$env/static/public` | `https://stream.traskriver.com/trask/index.m3u8` | Player source URL; baked at build |

**Removed env (current → delete):**

- `CF_STREAM_CUSTOMER_CODE`
- `CF_STREAM_LIVE_INPUT_UID`
- `CF_STREAM_SIGNING_KEY_ID`
- `CF_STREAM_SIGNING_JWK`
- `RELAY_API_TOKEN` (bearer used by old demand + status routes)
- `DEMAND_WINDOW_SECONDS`

**Files to modify (subtractive):**

| File                                        | Change                                                                                                                                                                                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/routes/stream.remote.ts`               | **Delete**                                                                                                                                                                                                                                                                                 |
| `src/routes/api/stream/demand/+server.ts`   | **Delete** (also delete the empty `stream/demand/` directory)                                                                                                                                                                                                                              |
| `src/routes/api/relay/status/+server.ts`    | **Delete** (also delete the empty `relay/status/` + `relay/` dirs)                                                                                                                                                                                                                         |
| `src/routes/api/test-kv/+server.ts`         | **Delete**                                                                                                                                                                                                                                                                                 |
| `src/routes/+page.svelte`                   | Collapse 6-state machine → 4-state (`connecting`/`viewing`/`degraded`/`error`). Remove demand POST on load, remove `lastKnownRelayState`, remove `/api/relay/status` polling. Derive `degraded` from `VideoPlayer` `onManifestStale` event.                                                |
| `src/lib/components/VideoPlayer.svelte`     | Replace `liveSrc = (await getStreamInfo()).liveHlsUrl` with `liveSrc = PUBLIC_STREAM_HLS_URL`. Remove any CF-Stream-specific 204/401 handling. Add manifest-sequence-freshness watcher (dispatches `degraded`). Keep existing hls.js config (already matches 2s segments per FEATURES.md). |
| `src/lib/components/LiveViewerCount.svelte` | **Delete** (per FEATURES: retire on-page count)                                                                                                                                                                                                                                            |
| `src/lib/components/TelemetryFooter.svelte` | Decouple from relay status. Sources `/health` is out of MVP scope; either (a) show static `live` badge, or (b) drop telemetry entirely. Milestone-level call; default to static.                                                                                                           |
| `src/routes/+page.svelte` sidebar           | Remove "Start stream" button, remove viewer count. Replace with static "Watching live" copy + fullscreen toggle.                                                                                                                                                                           |
| `src/hooks.server.ts`                       | Review for KV/stream-related logic; trim.                                                                                                                                                                                                                                                  |
| `wrangler.jsonc` (or `wrangler.toml`)       | Remove stream-related secret bindings; leave `RIVER_KV` binding attached but unreferenced (for cold-fallback reactivation).                                                                                                                                                                |

**State machine simplification** (from FEATURES.md):

```
OLD: idle → starting → viewing → ended_confirming → ended  (+ unavailable, + error)
NEW: connecting → viewing ⇌ degraded  (+ error)
```

No `idle` (no user-initiated start). No `ended*` (stream is always on). No `unavailable` (origin either responds or doesn't).

**Side-effects to sidebar / telemetry / viewer count:**

- Sidebar stream-control section shrinks to copy-only.
- Telemetry footer either goes static or is deferred to post-MVP when `/health` is wired through a server route (see "health surface" caveat above — do NOT call `/health` from the browser directly; route through a web SSR route if ever wanted).
- `LiveViewerCount.svelte` deleted; PostHog remains the truth for retrospective counts.

### `packages/shared`

Current exports (`packages/shared/index.ts`):

```
DemandResponse              → DELETE (demand route gone)
RelayState                  → DELETE from active surface; move to a sub-path `shared/relay.ts` kept for cold-fallback relay code
RelayInternalState          → same as RelayState
RelayStatusPayload          → same
RelayStatusResponse         → same
RELAY_STATUS_TTL_SECONDS    → same
RELAY_STATUS_STALE_THRESHOLD_MS → same
RelayConfig                 → same
```

**Migration plan:**

1. Move all relay-\*/demand types to `packages/shared/src/relay.ts` and re-export from `packages/shared/relay` (subpath export in package.json).
2. Root `index.ts` no longer exports them. Only `packages/relay` imports from the `@traskriver/shared/relay` subpath.
3. This keeps the cold-fallback code in `packages/relay` compiling without polluting the web app's type surface.
4. **New types** needed by v1.2: none on the shared boundary. The only new boundary is HLS URL (a string env var; no shared type required). If ever the web adds an SSR `/api/stream/health` passthrough, a `StreamHealth` type lives there; not needed for MVP.

After migration, `packages/shared/index.ts` becomes near-empty (or can be dropped if unused — check `packages/web` imports).

### `packages/relay`

- **Disposition:** kept in repo, stops deploying. Not in any active flow.
- **Still deployed on Pi after cutover:** **nothing**. Recommended post-cutover Pi ops:
  1. `systemctl stop river-relay river-relay-reset.timer river-relay-boot-sync.service`
  2. `systemctl disable --now river-relay`
  3. Leave `/opt/river-relay/` in place for cold-fallback reactivation.
- **Pi hardware:** out of scope per the question. Note in README: "Pi retained as cold-fallback node; can be powered off or repurposed at owner's discretion."
- **README updates:**
  - Prepend a `> Status: retired (v1.2). Kept as documented cold fallback.` banner.
  - Add "Reactivation" section: what env vars to set, how to redirect RTMPS back to a CF Stream input, how to re-enable the systemd units. 1 page max.
  - Mark `Deployment` section as "only if reactivating."
- **GitHub Actions** (relay deploy workflow): add a workflow-level `if: false` switch or mark manually-triggered-only. Do NOT delete; cold-fallback needs it.
- **Code:** untouched. `state-machine.ts`, `ffmpeg.ts`, `poller.ts` all compile as-is against the relocated `@traskriver/shared/relay` subpath.

### External services

| Service                           | Integration                                                     | Notes                                                                                                                                                   |
| --------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare CDN (orange cloud)** | DNS proxy + cache rules on `stream.traskriver.com`              | ToS-blocker per PITFALLS. SSL mode **Full (strict)** → origin VPS must have valid TLS (Let's Encrypt via certbot, or CF Origin Cert if orange-clouded). |
| **Cloudflare DNS**                | A record `stream.traskriver.com → VPS IP` (proxied)             | Plus `ops.stream.traskriver.com → VPS IP` (DNS only) for `/health`.                                                                                     |
| **Cloudflare KV**                 | `RIVER_KV` binding retained in `wrangler.jsonc`                 | Unused by v1.2 active path. Binding stays to avoid touching Workers infra if relay reactivated.                                                         |
| **Cloudflare Stream**             | Live input retained on dashboard for 7 days post-cutover        | Rollback safety net. Delete after 7 days of origin stability.                                                                                           |
| **DDNS provider**                 | Camera's built-in DDNS OR router's OR a generic (DuckDNS/No-IP) | Provider choice user-owned. FEATURES assumed "generic." Architecture requires: stable hostname, <60s propagation on IP change.                          |
| **PostHog**                       | Unchanged                                                       | Already analytics-only; unaffected.                                                                                                                     |
| **USGS / weather**                | Unchanged                                                       | Unaffected.                                                                                                                                             |

---

## Cloudflare Config (concrete)

### DNS

- `stream.traskriver.com` → VPS public IP, **Proxied (orange)**, SSL: Full (strict).
- `ops.stream.traskriver.com` → VPS public IP, **DNS only (grey)**, optional CF Access in front.

### Cache Rules (in order)

| #   | Match                                                                                                 | Edge TTL               | Browser TTL | Origin `Cache-Control`             |
| --- | ----------------------------------------------------------------------------------------------------- | ---------------------- | ----------- | ---------------------------------- |
| 1   | `hostname eq "stream.traskriver.com" and ends_with(uri.path, ".m3u8")`                                | 1s (Override)          | 2s          | `public, max-age=1, s-maxage=1`    |
| 2   | `hostname eq "stream.traskriver.com" and (ends_with(uri.path, ".ts") or ends_with(uri.path, ".m4s"))` | 1 day (Respect origin) | 1 day       | `public, max-age=86400, immutable` |
| 3   | `hostname eq "ops.stream.traskriver.com"`                                                             | Bypass cache           | —           | `no-store` (Fastify route)         |

### Configuration Rules (disable features)

On `stream.traskriver.com/*`: disable **Auto Minify**, **Rocket Loader**, **Mirage**, **Polish**, **Email Obfuscation**. None apply to HLS and some damage responses.

### SSL

- **Full (strict)** required. VPS must serve valid TLS. Two options, both acceptable:
  - **Let's Encrypt** on port 443 via certbot + nginx-in-front-of-MediaMTX (adds a tiny proxy hop) OR via MediaMTX's built-in TLS.
  - **Cloudflare Origin CA** certificate installed on VPS (simpler, only CF can reach origin — good).

### Cache purge on deploy

- **Not required.** m3u8 TTL is 1s; segments have unique filenames (content-addressed by sequence number). Old segments age out naturally.
- Expose a deploy-time `curl` of Cloudflare purge API only for emergency flushes. Document, don't automate.

### Rate limiting

- Not in v1.2. CF's default DDoS protections apply. Revisit if abuse observed.

**FLAG (repeated from STACK.md, surfaced here):** Cloudflare free/Pro/Business plans' ToS restrict serving video files from the CDN. This is a **milestone-level blocker** addressed in PITFALLS, not a cache-rule detail. Architecture assumes the block is resolved (Enterprise, R2-origin hybrid, or risk-accepted).

---

## DDNS + Camera Exposure

- **Provider:** user's call. Camera has built-in DDNS supporting generic DDNS providers (DuckDNS/No-IP/etc.). Router-level DDNS is an acceptable fallback. Architecture requires only (a) stable hostname and (b) propagation <60s on IP change.
- **Forwarded ports:**
  - `554/tcp` (RTSP) — forwarded to camera LAN IP. **Only this port.**
  - `80/tcp` (camera admin UI) — **never forwarded.**
  - `443/tcp`, `8000/tcp`, ONVIF ports — **never forwarded.**
- **Credentials:**
  - Camera RTSP account distinct from admin account, minimum-privilege (RTSP-stream read only).
  - Strong password (20+ char). Stored in VPS env (`CAM_PASS`) referenced by MediaMTX config.
  - **Rotation:** manual. Document in `packages/stream/README.md`. Frequency recommendation: 90 days, or immediately on any suspected exposure.
- **Failure modes:**
  - **IP change mid-stream:** DDNS hostname re-resolves. MediaMTX's TCP RTSP connection dies → supervisor backoff kicks in → reconnects within 1–4s on typical DDNS propagation. HLS playlist briefly stops advancing → viewer's hls.js buffer covers → supervisor reconnect → new segments appear with `#EXT-X-DISCONTINUITY` → playback resumes.
  - **DDNS stale/not-updated:** supervisor keeps retrying. `/health` surfaces `rtspConnected: false`. Document a 5-min threshold for ops alerting (optional uptime monitor rule).
  - **Camera reboot:** same failure mode as IP change; covered by backoff + discontinuity.

---

## Data Flows

### Viewer load (happy path, v1.2)

```
Browser GET https://traskriver.com
    ↓
Worker renders page (no server-side stream state; no KV reads; no demand POST)
    ↓
Browser JS: vidstack init with PUBLIC_STREAM_HLS_URL
    ↓
hls.js → GET stream.traskriver.com/trask/index.m3u8
    ↓
CF edge → cached (1s TTL) or origin pull
    ↓
Origin (MediaMTX :8888) serves current manifest
    ↓
hls.js fetches last 3 segments (CF-cached, 1d immutable)
    ↓
First frame decoded in ~1–3s
    ↓
State: connecting → viewing
    ↓
Polling manifest every ~2s; watching #EXT-X-MEDIA-SEQUENCE progression
```

### RTSP ingest loop (steady state)

```
MediaMTX → TCP connect cam.ddns.example:554
    ↓ RTSP DESCRIBE / SETUP / PLAY (SDP negotiation)
    ↓ RTP over TCP, H.264 NALUs
    ↓ MediaMTX mux → TS segments every 2s
    ↓ Write /var/lib/stream/hls/trask/segment_N.ts
    ↓ Rewrite /var/lib/stream/hls/trask/index.m3u8 (window of 7)
    ↓ Delete segment_N-7.ts (MediaMTX handles)
```

### Camera drops mid-stream

```
MediaMTX RTSP TCP read timeout (15s)
    ↓
MediaMTX marks path `ready: false`
    ↓
Supervisor polls /v3/paths/get/trask, sees not-ready 3x → restarts MediaMTX child
    ↓ (OR MediaMTX retries internally; both are fine)
Stream segments stop being written
    ↓
Manifest truncates to last valid segments
    ↓
hls.js buffers drain (~6–10s)
    ↓
Browser notices MEDIA-SEQUENCE hasn't advanced → state: viewing → degraded
    ↓
UI overlay: "Camera offline — retrying"
    ↓
On reconnect: new segments with EXT-X-DISCONTINUITY → state: degraded → viewing
```

---

## Build Order (for Roadmapper)

Dependency graph:

```
[0] Decide CF ToS path (milestone blocker; not a phase)
    └─▶ [1] packages/stream skeleton (Node + Fastify + logger + config)
             ├─▶ [2] packages/stream: MediaMTX supervisor + spawn/backoff
             │       └─▶ [3] packages/stream: /health + MediaMTX API client
             │
             └─▶ [4] packages/shared: move relay types to subpath (parallel with [2]/[3])

        ┌────────[5] VPS provisioning + DNS + CF cache rules (parallel with [2]/[3])
        │
        └────────[6] DDNS + port-forward + camera H.264 config (parallel; user-owned)

[2+3+5+6] ─▶ [7] End-to-end smoke test: camera → VPS → CF → curl m3u8 + .ts
                 └─▶ [8] packages/web: swap VideoPlayer to PUBLIC_STREAM_HLS_URL (flag-guarded)
                          └─▶ [9] packages/web: state machine collapse + route deletions
                                   └─▶ [10] Cutover deploy (atomic; env flag on)
                                             └─▶ [11] 7-day stability observation
                                                       └─▶ [12] Relay decommission + CF Stream live input delete
```

### What can run in parallel

- **[1] package skeleton** and **[5] VPS provisioning / CF rules** and **[6] DDNS / camera config** are independent; run concurrently.
- **[4] shared types move** is independent of stream package internals; can run anytime before [9].
- **[11] observation window** is wall-clock waiting; next milestone work can start during it.

### What is strictly serial

- [2] supervisor → [3] health probe (supervisor emits state consumed by health).
- [7] E2E smoke → [8] web swap (can't flag-guard without a known-working URL).
- [8] web swap → [9] deletions (delete only after swap is verified behind flag).
- [10] cutover → [11] observation → [12] decommission (never decommission before stability confirmed).

### Cutover point

**Single atomic deploy** at step [10]:

- Env change: `PUBLIC_STREAM_HLS_URL` baked at build.
- Code change: deletions + state-machine simplification committed in the same commit.
- Deploy via `wrangler deploy`; previous Worker version kept (Workers keep last versions for instant rollback).
- Old CF Stream live input stays up but unused for 7 days.

---

## Migration / Cutover Strategy

**Chosen: Atomic-per-deploy with behind-the-scenes parallel-run.**

### Recommended approach

1. **Parallel-run phase (pre-cutover):**
   - `packages/stream` is live on VPS and serving `stream.traskriver.com/trask/index.m3u8`.
   - CF Stream live input is also live (Pi relay can push, or not — Pi can be off; CF Stream input retained purely as a URL to flip back to).
   - `packages/web` **still reads CF Stream** (old `stream.remote.ts` intact). Stream origin gets zero viewer traffic; only the maintainer tests via direct URL.
   - Duration: at least 48h. Maintainer confirms origin stability via direct URL + `/health` + journalctl.

2. **Atomic cutover (single deploy):**
   - PR that in a single commit:
     - Replaces `getStreamInfo()` call site with `PUBLIC_STREAM_HLS_URL` env read.
     - Deletes `stream.remote.ts`, `api/stream/demand/`, `api/relay/status/`, `api/test-kv/`.
     - Collapses page state machine.
     - Removes `LiveViewerCount.svelte`, sidebar start-button, etc.
     - Removes CF-Stream env bindings from `wrangler.jsonc`.
   - Deploy via CI. Workers preserves previous version.
   - Immediate verification: page loads, player reaches `viewing` within 5s, no 4xx/5xx on origin.

3. **48h watchful-silence window:**
   - PostHog dashboards + uptime monitor on `ops.stream.traskriver.com/health`.
   - Do NOT touch Pi, CF Stream live input, or KV entries during this window.

4. **Rollback plan (first 48h):**
   - **Fast path (code bug only):** `wrangler rollback` to previous Workers version. Deployment reverts; site is back on CF Stream path.
   - **Slow path (origin failure):** `wrangler rollback` + re-enable Pi (`systemctl start river-relay`) via Tailscale SSH. Within 10 min of Pi boot, stream is live on CF Stream.
   - Requires: CF Stream live input must exist. Requires: Pi powered on (or user can power it on).

5. **Decommission (after 7 days of stability):**
   - Disable relay systemd units on Pi.
   - Delete CF Stream live input in CF dashboard.
   - Remove `RELAY_API_TOKEN` and any other dormant secrets.
   - `packages/shared/relay.ts` stays (supports cold-fallback reactivation).

### Why not a full feature-flag parallel-run with runtime toggle?

- Considered and rejected. A runtime toggle on the web side (flag reads CF Stream OR new origin) requires keeping both code paths alive, including JWT signing. The JWT signer is meaningful surface area. Keeping it around delays the actual win of v1.2.
- Build-time env flag + `wrangler rollback` achieves 95% of the safety at 20% of the complexity. Workers' version history is effectively a rollback toggle without keeping old code in the live bundle.

### Why not a progressive rollout (N% of traffic)?

- Cloudflare Stream and our origin emit different URLs. CF Workers doesn't natively support % splitting on static asset URLs without Worker middleware, which is more code than the cutover itself. Not worth it for a river cam with modest traffic.

---

## Failure Mode Table

| #   | Failure                                           | Trigger                                           | Origin behavior                                                                                                                                                      | CDN behavior                                                                                        | Web UI state                                                                                         | Recovery                                                                                                                                                                                                    |
| --- | ------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Camera offline**                                | Power loss, RTSP auth expired, router reboot      | MediaMTX path `ready: false`; stops writing segments. Supervisor logs `rtspConnected: false`                                                                         | Last segments remain cached (1d immutable); manifest ages out (1s TTL) within 2s, then 404 or stale | `viewing → degraded` (derived from stalled MEDIA-SEQUENCE); overlay: "Camera offline — retrying"     | MediaMTX auto-reconnects on camera return. New segments emit with `#EXT-X-DISCONTINUITY`; hls.js resumes. UI flips `degraded → viewing`.                                                                    |
| 2   | **VPS down** (kernel panic, provider outage)      | systemd can't restart (dead host)                 | No origin available                                                                                                                                                  | CF serves last cached manifest for ~1s, then 522/523                                                | `viewing → error` after hls.js fatal error threshold; 10s remount loop                               | Host recovery (xCloud manages). If >5 min, **manual rollback**: `wrangler rollback` + boot Pi.                                                                                                              |
| 3   | **VPS up, MediaMTX crash loop**                   | Malformed RTSP response, config error post-deploy | Supervisor backoff 1→30s cap; `/health` shows `restartsLast1h` climbing                                                                                              | Manifest stale; segments age out after 1d                                                           | Same as #1 (`degraded`) initially, then `error` if segments drain fully                              | Supervisor fixes transient crashes. Sticky crashes require SSH + log inspection + fix.                                                                                                                      |
| 4   | **Cloudflare edge outage** (rare, regional)       | CF incident                                       | Origin unaffected (direct access still works on `stream.traskriver.com` DNS-resolving path, though in practice the CF-proxied A record is unreachable during outage) | CF returns 5xx or timeout                                                                           | `viewing → error`                                                                                    | Wait for CF. Optional mitigation: emergency DNS flip of `stream.traskriver.com` to DNS-only (grey cloud) — documented runbook, <5 min via dashboard. Origin capacity is fine for direct hits at v1.2 scale. |
| 5   | **Origin restart** (deploy, systemd restart)      | Expected maintenance                              | MediaMTX child dies cleanly; ~5–10s downtime; new process starts; emits `#EXT-X-DISCONTINUITY` at resumption                                                         | `.ts` cached (1d); m3u8 cached (1s → stale quickly)                                                 | hls.js buffers cover 6–10s; worst case brief stall → `viewing` continues                             | Automatic. Zero manual action.                                                                                                                                                                              |
| 6   | **DDNS IP not updated**                           | Home WAN IP changed, DDNS client paused           | MediaMTX can't reach camera; treats as #1                                                                                                                            | Same as #1                                                                                          | Same as #1                                                                                           | Fix DDNS client (manual); supervisor auto-reconnects on resolution.                                                                                                                                         |
| 7   | **CF ToS enforcement** (HLS served from free/Pro) | CF flags domain for video CDN violation           | N/A                                                                                                                                                                  | Requests blocked/throttled                                                                          | `viewing → error` intermittently                                                                     | Migrate to Enterprise OR R2-backed origin OR remove CF proxy (grey cloud, direct hits). **This is a PITFALLS item; not expected at v1.2 traffic but documented.**                                           |
| 8   | **Cloudflare KV retained but orphaned**           | Post-cutover; keys never read                     | N/A (web never reads)                                                                                                                                                | N/A                                                                                                 | Cosmetic only; KV entries expire naturally (120s TTL on status, no TTL on demand but overwrite-only) | None needed; documentation-only.                                                                                                                                                                            |

---

## Scaling Considerations

| Scale                      | Concern                         | Adjustment                                                                                                                                      |
| -------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–100 concurrent viewers   | CPU/bandwidth on origin         | None. CF absorbs ~all traffic. Origin sees ~1 edge fetch per segment per edge location (~dozens).                                               |
| 100–10k concurrent viewers | CF egress cost, CF ToS exposure | None at architecture level. ToS is the real concern; see PITFALLS.                                                                              |
| 10k+ viewers               | Multi-origin HA                 | Not v1.2 scope. Would introduce: (a) R2 origin for segment storage, (b) multi-VPS MediaMTX fleet with shared RTSP ingest, (c) CF Load Balancer. |

**First bottleneck that bites:** Cloudflare ToS, not technical capacity. Second: home upload (40 Mbps ceiling on RTSP pull; irrelevant at CDN egress).

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Exposing `/health` on the public CF-proxied hostname

**What people do:** Put `GET /health` on `stream.traskriver.com/health` because it's convenient.
**Why it's wrong:** (a) `/health` reveals internal state (restart counts, last error messages) to the public. (b) It gets CF-cached unless explicitly bypassed. (c) It conflates viewer CDN surface with ops surface; a CF cache-rule mistake could mask origin outages.
**Do this instead:** Separate hostname or path under Cloudflare Access, or bind Fastify to Tailscale interface only. Web app derives liveness from manifest freshness, not `/health`.

### Anti-Pattern 2: Web polling origin `/health` to drive `degraded` state

**What people do:** Replace the old `/api/relay/status` poll with a new `/api/stream/health` passthrough to origin.
**Why it's wrong:** (a) Reintroduces the cross-origin polling we're retiring. (b) Doubles the ops surface (health must be reachable from CF Worker runtime). (c) A green `/health` with stalled segments is still a bad stream — the viewer cares about segment freshness, not process liveness.
**Do this instead:** `VideoPlayer.svelte` watches `#EXT-X-MEDIA-SEQUENCE` progression inside hls.js events. No extra HTTP.

### Anti-Pattern 3: Persistent disk for HLS segments

**What people do:** Write segments to `/opt/stream/hls/` on the VPS SSD.
**Why it's wrong:** (a) Pointless IO; segments are ephemeral. (b) Restart leaves old segments with unclear provenance. (c) Disk fills on a monitoring lapse.
**Do this instead:** tmpfs at `/var/lib/stream/hls/`. Declared via systemd `RuntimeDirectory` so lifecycle is tied to the service.

### Anti-Pattern 4: Deleting `packages/relay` entirely

**What people do:** "We're retiring it; delete the code."
**Why it's wrong:** Cold-fallback is a stated requirement. Deleting removes the cheapest insurance policy against a stream outage in the first weeks.
**Do this instead:** Mark retired in README, stop deploying, keep code + CI workflow with manual-trigger-only. Revisit deletion at v1.3 or later.

### Anti-Pattern 5: Using Cloudflare Stream's JWT pattern as a template for self-hosted

**What people do:** Sign HLS URLs even though the stream is public.
**Why it's wrong:** (a) The stream is public by design (decided in PROJECT.md). (b) Signing adds client-side token-refresh complexity. (c) MediaMTX's JWT-auth path requires extra config and doesn't buy anything for a public river cam.
**Do this instead:** Plain public URL. Rely on CF orange cloud for DDoS/bot shield.

### Anti-Pattern 6: Transcoding "just in case"

**What people do:** Enable MediaMTX's ffmpeg transcoder to "normalize" bitrate.
**Why it's wrong:** (a) CPU cost on a 1–2 vCPU VPS. (b) Adds latency. (c) Camera already emits clean H.264. (d) Creates a new failure mode (transcoder can crash).
**Do this instead:** `-c:v copy` / MediaMTX passthrough. Tune the camera, not the pipeline (per STACK.md + FEATURES.md).

---

## Patterns to Follow

### Pattern 1: Mirror the relay's supervisor for the stream supervisor

**What:** Port `packages/relay/src/state-machine.ts` + `ffmpeg.ts` + `health-server.ts` 1:1 to `packages/stream/src/`, adapting for always-on (no demand polling, no cooldown cycles).
**When to use:** For any Node process supervising a long-running binary with backoff.
**Trade-offs:** + familiar mental model; + minimal net-new code. − tempting to over-copy (drop the demand polling and related state transitions).

**Example pattern:**

```typescript
class Supervisor {
	private state: 'starting' | 'ready' | 'degraded' | 'backoff' = 'starting';
	private mediamtx: ExecaChildProcess | null = null;
	private backoffMs = 1000;

	async start() {
		this.mediamtx = execa('/opt/stream/mediamtx', ['/opt/stream/mediamtx.yml']);
		this.mediamtx.on('exit', (code) => this.onExit(code));
		await this.waitForReady();
	}

	private onExit(code: number | null) {
		if (this.shuttingDown) return;
		this.state = 'backoff';
		setTimeout(() => this.start(), this.backoffMs);
		this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
	}
}
```

### Pattern 2: Derive viewer-side health from the manifest

**What:** `VideoPlayer.svelte` watches hls.js `LEVEL_LOADED` events and tracks `#EXT-X-MEDIA-SEQUENCE`. Stall-detect threshold = 10s without advancement while `playing`.
**When to use:** Any self-hosted HLS origin where a separate `/health` endpoint is not viewer-reachable.
**Trade-offs:** + zero extra requests; + true to what the viewer sees. − tuning the stall threshold takes one production observation cycle.

```typescript
hls.on(Hls.Events.LEVEL_LOADED, (_e, data) => {
	if (data.details.live) {
		const seq = data.details.startSN + data.details.fragments.length - 1;
		if (seq === lastSeq && Date.now() - lastSeqAt > 10_000) {
			dispatch('degraded');
		} else if (seq !== lastSeq) {
			lastSeq = seq;
			lastSeqAt = Date.now();
			if (currentState === 'degraded') dispatch('viewing');
		}
	}
});
```

### Pattern 3: Deletion before addition in the web cutover commit

**What:** In the single cutover PR, include deletions inline (demand, status, JWT, viewer count) alongside the additions (env var read, state collapse). Reviewing surface is "what goes away" + "what stays minimal."
**When to use:** Any migration where the new thing replaces a whole vertical slice.
**Trade-offs:** + reviewer sees the whole picture; + no dead code in main; + rollback is a single revert. − larger diff.

### Pattern 4: Subpath export for retiring-but-retained shared types

**What:** Move relay/demand/JWT types to `@traskriver/shared/relay` subpath; only `packages/relay` imports from it. Root package stays clean for active consumers.
**When to use:** Deprecating surface area without deleting it.
**Trade-offs:** + explicit boundary; + imports reveal intent. − one more line in `package.json` exports map.

---

## Integration Point Checklist (Condensed)

### `packages/stream` (new)

- [ ] `index.ts` boots: config → logger → supervisor → http-server.
- [ ] env schema (zod): `RTSP_URL`, `CAM_PASS`, `HLS_PATH_NAME` (default `trask`), `HEALTH_PORT` (default 8080), `HLS_PORT` (default 8888), `MEDIAMTX_BINARY` path, `MEDIAMTX_CONFIG` path, `LOG_LEVEL`.
- [ ] supervisor implements: spawn, stderr→pino, backoff, API probe loop, graceful shutdown on SIGTERM/SIGINT.
- [ ] http-server: Fastify on `:8080` with routes `GET /health`, `GET /` (redirect to /health or 404).
- [ ] systemd unit in `config/stream.service` (reference file, user-deployed).
- [ ] MediaMTX config template with env substitution at deploy time (via `scripts/render-config.ts` or envsubst).
- [ ] tmpfs at `/var/lib/stream/hls` declared (either in systemd or in README).
- [ ] README: setup, ops commands, rotation, troubleshooting.

### `packages/web`

- [ ] Delete: `routes/api/stream/demand/`, `routes/api/relay/status/`, `routes/api/test-kv/`, `routes/stream.remote.ts`, `lib/components/LiveViewerCount.svelte`.
- [ ] Modify `VideoPlayer.svelte`: `liveSrc` from `PUBLIC_STREAM_HLS_URL`; add manifest-freshness watcher; dispatch `degraded` event.
- [ ] Modify `+page.svelte`: remove demand POST, status polling; collapse states to `connecting/viewing/degraded/error`; update sidebar copy.
- [ ] Modify `TelemetryFooter.svelte`: remove relay-status source; either static "Live" or delete the component.
- [ ] Modify `hooks.server.ts`: trim stream-related logic.
- [ ] Modify `wrangler.jsonc`: remove CF Stream secrets; keep `RIVER_KV` binding (documented as dormant).
- [ ] Add `PUBLIC_STREAM_HLS_URL` to `.env.example`.

### `packages/shared`

- [ ] Move current exports to `src/relay.ts`.
- [ ] Update `package.json` to add `./relay` subpath export.
- [ ] Root `index.ts`: empty or near-empty (retain only non-relay shared types; currently none).
- [ ] Update `packages/relay/src/*` imports from `@traskriver/shared` → `@traskriver/shared/relay`.

### `packages/relay`

- [ ] README banner: "Retired (v1.2). Cold fallback only."
- [ ] Add "Reactivation" section to README.
- [ ] GitHub Actions workflow: flip to `workflow_dispatch:` only (no push trigger).
- [ ] No code changes.

### External (user-owned, document only)

- [ ] VPS provisioned, MediaMTX binary installed, systemd unit enabled.
- [ ] DNS: `stream.traskriver.com` proxied; `ops.stream.traskriver.com` grey-cloud.
- [ ] CF: cache rules configured per table above; SSL Full (strict); minify/rocket disabled on HLS paths.
- [ ] DDNS: configured on camera or router; hostname resolves to home WAN.
- [ ] Router: port 554/tcp forwarded to camera LAN IP; NO other ports.
- [ ] Camera: H.264, 2s GOP, 3–6 Mbps CBR, RTSP account distinct from admin.
- [ ] Uptime monitor (optional): ping `ops.stream.traskriver.com/health` every 5 min.

---

## Sources

- Existing codebase: `packages/web/src/routes/api/stream/demand/+server.ts`, `packages/web/src/routes/api/relay/status/+server.ts`, `packages/web/src/routes/stream.remote.ts`, `packages/relay/src/*`, `packages/shared/index.ts` — read directly 2026-04-20.
- `.planning/research/STACK.md` — MediaMTX-supervised pattern, Cloudflare cache rules, Fastify/pino choices, ToS warning.
- `.planning/research/FEATURES.md` — state machine collapse, `/preview.jpg` feature, viewer-count retirement, manifest-freshness approach.
- `.planning/PROJECT.md` — milestone scope, public-HLS decision, relay-retired-as-cold-fallback decision.
- HLS spec (RFC 8216) §4.3.3.2 (`#EXT-X-MEDIA-SEQUENCE`), §4.3.2.3 (`#EXT-X-DISCONTINUITY`) — behavior during origin restart.
- Cloudflare Cache Rules / `CDN-Cache-Control` docs — verified in STACK.md (HIGH confidence).

---

_Architecture research for: v1.2 self-hosted HLS origin (`packages/stream`) in the traskriver.com monorepo._
_Researched: 2026-04-20_
