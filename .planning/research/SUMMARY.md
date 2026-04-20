# Project Research Summary

**Project:** Trask River Cam — v1.2 Self-Hosted Stream milestone
**Domain:** Always-on RTSP → HLS origin (Node + MediaMTX on VPS), fronted by a CDN, consumed by an existing SvelteKit/Workers viewer app. Cutover from Cloudflare Stream + on-demand Pi relay to a self-hosted public HLS pipeline.
**Researched:** 2026-04-20
**Confidence:** HIGH overall (stack/features/architecture grounded in current library sources + existing codebase; pitfalls grounded in CVE/KEV data + Cloudflare's current ToS). Two unresolved **P0 milestone-level gates** identified.

## Executive Summary

v1.2 is a **pipeline swap, not a feature expansion**. The four research tracks converge on a small, boring implementation: a ~250-LOC Node supervisor in `packages/stream` that spawns MediaMTX v1.17.1 (static Go binary), configured for RTSP → HLS passthrough with **H.264 only, 2 s segments, 6-segment playlist window**. The supervisor mirrors the existing `packages/relay` shape 1:1 (`state-machine.ts` → `supervisor.ts`, `ffmpeg.ts` → `mediamtx.ts`, `health-server.ts` → `http-server.ts`). Cutover is a single atomic web deploy after a ≥48h origin-stability window, with Cloudflare Stream + the Pi kept warm for a 7-day rollback window. Most web-side work is **subtractive**: delete `stream.remote.ts` (JWT signer), `/api/stream/demand`, `/api/relay/status`, `/api/test-kv`, `LiveViewerCount.svelte`, the old 6-state page machine, and the start button.

**Two milestone-level P0 gates override parts of the stack/architecture work before any code lands:**

1. **Cloudflare ToS on video CDN (Pitfall 1).** STACK.md and ARCHITECTURE.md both assumed orange-cloud with cache rules on `*.m3u8` / `*.ts`. This **violates Cloudflare's current Service-Specific Terms** (last updated 2026-03-24) for Free/Pro/Business plans. The recommended compliant path is **grey-cloud `stream.traskriver.com` (DNS-only)**, serving viewer egress directly from the VPS. Bunny.net ($1–5/mo at this scale) is the pre-validated fallback if grey-cloud causes viewer pain. Under grey-cloud, the detailed cache-rules content in STACK.md §"Cloudflare CDN Configuration (HLS Origin Pull)" and ARCHITECTURE.md §"Cloudflare Config (concrete)" becomes **reference-only** — the `Cache-Control` headers stay correct at origin for future CDN reinstatement, but no CF cache rules are applied.
2. **CGNAT precondition (Pitfall 9).** If the home ISP places the router behind CGNAT (`100.64.0.0/10` WAN IP, or WAN IP ≠ public IP), direct-RTSP-pull from the VPS is **impossible**; v1.2 as designed cannot ship. Fallback is a **Pi-as-Tailscale-bridge** reverse-tunnel (Pi keeps a minimal role, not "fully retired"). Must be verified via `nmap -p 554 cam.ddns.example` from the VPS **before** P7 smoke.

Key risks beyond the P0 gates are all well-understood: (a) camera firmware CVEs on direct public RTSP exposure — 2021 Dahua CVEs are on CISA KEV, 2025 Xiongmai hardcoded-RTSP-password CVE has no patch — mitigated by 554-only forwarding, distinct minimum-privilege RTSP user, and a P6 CVE pre-flight against the specific camera model/firmware; (b) RTSP reconnect storms and stall-blindness — mitigated by exponential backoff (1→30s cap) and a 60–90s stall watchdog using MediaMTX's `/v3/paths/get/trask` API as the primary liveness signal (the existing relay's 320s ffmpeg stall threshold is too long for always-on and must be tuned down); (c) browser codec mismatch if the camera is ever switched to H.265 — mitigated by a supervisor codec guard that refuses to reach `ready` unless the track codec is `H264`.

## Key Findings

### Recommended Stack

A tiny Node 22 LTS supervisor around a MediaMTX v1.17.1 child. Node owns: spawn/backoff/shutdown, `/health`, structured pino logs. MediaMTX owns: the entire RTSP→HLS hot path (ingest, mux, segment write, HTTP origin on :8888, LL-HLS-ready). This beats every pure-Node option (`node-media-server` is RTMP-publisher-only, `fluent-ffmpeg` is unmaintained as of 2024-05) on stability and maintenance surface. No Docker, no Redis, no PostgreSQL — explicitly out of scope per milestone.

**Core technologies:**

- **MediaMTX v1.17.1** (static Go binary, systemd-supervised child of Node) — RTSP client + HLS/LL-HLS muxer + HTTP origin in one binary; config flip from MP4-HLS to LL-HLS is one line when/if we want sub-3s latency.
- **Node 22 LTS** + **Fastify 5.8.5** + **Pino 10.3.1** + **execa 9** + **zod** — tiny supervisor (~250 LOC total, split across 5 files mirroring `packages/relay/src/`). Fastify exposes `/health` only on the ops interface; MediaMTX serves HLS directly on :8888.
- **Camera → H.264 passthrough, 3–6 Mbps CBR, 2s closed GOP.** No transcode on the VPS. H.265 is a support nightmare in 2026 (Chrome/Firefox/Edge all ≤ "partial" per caniuse.com/hevc; Safari only is a failure).
- **Grey-cloud DNS** (not orange-cloud) for `stream.traskriver.com` — overrides the cache-rules content in STACK.md §"Cloudflare CDN Configuration" per Pitfall 1. Bunny.net pull-zone is the pre-validated fallback.

See: [`STACK.md`](./STACK.md) for full version pinning, installation, and the MediaMTX config template.

### Expected Features

v1.2 is pipeline-only. Feature inventory is small and deliberately boring; differentiators live in UX polish (honest `degraded` signalling, `/preview.jpg`), not new widgets.

**Must have (table stakes):**

- Always-on RTSP ingest with auto-reconnect (supervised MediaMTX + exponential backoff)
- Fast viewer join (~1–3s to first frame) — enabled by 2s segments + 2s GOP + 6-segment playlist window + existing `liveSyncDurationCount: 3` in `VideoPlayer.svelte` (already tuned)
- Cache-correct HLS headers at origin (`*.m3u8` 1s / `*.ts` 1d immutable) — stays correct even under grey-cloud for future CDN reinstatement
- `EXT-X-DISCONTINUITY` on origin/camera reconnects
- `/health` endpoint (ops-only, Tailscale-bound or grey-cloud hostname with CF Access) exposing `{ rtspConnected, lastSegmentWrittenAgoMs, restartsLast1h, codec, uptimeMs }`
- Simplified page state machine: `connecting → viewing ⇌ degraded → error` (collapses from the current 6-state machine)
- Camera-offline `degraded` UX: poster + "Camera offline — retrying" overlay, **derived from HLS manifest freshness** (watching `#EXT-X-MEDIA-SEQUENCE` progression inside hls.js), **not** from polling `/health` from the browser (anti-pattern; reintroduces cross-origin heartbeats)

**Should have (competitive, low cost):**

- `/preview.jpg` latest-frame endpoint — single ffmpeg output alongside HLS; unlocks dynamic poster, OG image / social cards, and the camera-offline "last-known-frame" fallback (highest-leverage differentiator: ~2–4h of work, three downstream wins)
- `program-date-time` tag in playlist — free observability, zero UX cost

**Defer (v1.2.x or v1.3+):**

- Dynamic poster, uptime in telemetry footer, OG image polish — ship after v1.2 is stable for a week
- LL-HLS, ABR ladder, DVR, multi-rendition, WebRTC — all explicitly out of scope and documented as "when a use case emerges"

**Convergent cuts (surface across all 4 research files):**

- **On-page live viewer count** — origin can't count (CF absorbs viewer traffic); demand-based system that required it is gone. Retire `LiveViewerCount.svelte`; PostHog remains truth for retrospective analytics.
- **`/api/stream/demand`, `/api/relay/status`, `/api/test-kv`, `stream.remote.ts` (JWT signer)** — all delete in the cutover PR.
- **Telemetry footer with relay-sourced encoding/bitrate** — either reduce to a static "Live" badge or drop entirely (milestone-level call; default to static).

See: [`FEATURES.md`](./FEATURES.md) for the feature prioritization matrix, segment-size rationale, and page-state-machine mapping.

### Architecture Approach

Monorepo stays monorepo. Only **one new package** (`packages/stream`); most changes are subtractive in `packages/web`. `packages/relay` stays in the repo with a "retired — cold fallback only" README banner; its GitHub Actions workflow flips to `workflow_dispatch:` only. `packages/shared` relay/demand/JWT types move to a `@traskriver/shared/relay` subpath so the root is clean for active consumers.

**Major components (post-cutover):**

1. **`packages/stream` (new, VPS, Node 22 + systemd)** — `index.ts` → `config.ts` (zod over env) → `supervisor.ts` → `mediamtx.ts` (execa wrapper) → `mediamtx-client.ts` (:9997 API probe) → `http-server.ts` (Fastify :8080 `/health`) → `logger.ts` (pino). HLS on tmpfs at `/var/lib/stream/hls/` declared via systemd `RuntimeDirectory=stream`. MediaMTX serves HLS on :8888; Fastify serves `/health` on :8080 bound to Tailscale or a grey-cloud `ops.stream.traskriver.com`.
2. **`packages/web` (existing, SvelteKit on CF Workers)** — `VideoPlayer.svelte` swaps `liveSrc` to `PUBLIC_STREAM_HLS_URL`; adds manifest-freshness watcher dispatching `degraded`. `+page.svelte` collapses state machine, removes demand POST + relay polling + sidebar start-button. Cutover deletions: `routes/api/stream/demand/`, `routes/api/relay/status/`, `routes/api/test-kv/`, `routes/stream.remote.ts`, `lib/components/LiveViewerCount.svelte`.
3. **Cloudflare (config-only)** — DNS A record `stream.traskriver.com → VPS IP`, **grey-cloud (DNS-only)** per P0. `ops.stream.traskriver.com` optionally fronted by Cloudflare Access. `RIVER_KV` binding retained but dormant in `wrangler.jsonc` for cold-fallback reactivation.
4. **Camera + DDNS + Router (user-owned, doc-only)** — 554/tcp forwarded only; camera RTSP account distinct from admin; H.264 fixed 2s closed GOP at 3–6 Mbps CBR; UPnP disabled.

**Atomic cutover strategy.** Parallel-run ≥48h (origin up, web still on CF Stream, maintainer-only direct-URL testing) → single atomic deploy (env + deletions in one commit) → 7-day watchful-silence window → decommission (disable relay systemd units on Pi, delete CF Stream live input, remove dormant CF Stream secrets). Rollback = `wrangler rollback` + (slow path only) `systemctl start river-relay` via Tailscale SSH.

See: [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full E2E diagram, the 12-step build order with parallelism, and the component-by-component deletion list.

### Critical Pitfalls

1. **Cloudflare ToS on video through the free/Pro/Business CDN (CRITICAL, P0).** STACK.md + ARCHITECTURE.md both assumed orange-cloud; current CF Service-Specific Terms (2026-03-24) prohibit it for non-Enterprise plans. **Chosen mitigation: grey-cloud `stream.traskriver.com` as DNS-only.** VPS serves all viewer egress (~200–250 Mbps at 50 peak viewers × 4–5 Mbps; ~540 GB/month) — check VPS bandwidth plan. Bunny.net pull-zone ($1–5/mo) is the pre-validated fallback runbook. Any orange-cloud attempt invites a viewer-facing `This Video has been restricted…` redirect by CF's ratio-based detector.
2. **CGNAT precondition (CRITICAL, P0/P6 gate).** If home ISP uses CGNAT, direct RTSP pull is impossible. Verification: `curl ifconfig.me` on LAN vs router WAN UI; `ip route get 100.64.0.0`; `nmap -p 554 cam.ddns.example` from the VPS. Mitigation tiers: (a) ISP static IP request, (b) IPv6 end-to-end if supported, (c) **Pi-as-Tailscale-bridge** keeping a minimal role for the Pi (retiring the "Pi fully retired" phrasing in PROJECT.md). Must be tested before P7 E2E smoke.
3. **Camera exposure security (CRITICAL).** 554-only port-forward; RTSP user distinct from admin with minimum privileges; 20+ char unique password; UPnP disabled; firmware version pinned in `FIRMWARE.md` with 90-day re-check. **P6 CVE pre-flight** against the specific camera model: CVE-2021-33044/45 (Dahua, CISA KEV), CVE-2025-31700/31701 (Dahua), CVE-2025-65857 (Xiongmai XM530 + rebrands — hardcoded RTSP password, no patch), CVE-2025-66176/66177 (Hikvision LAN-adjacent).
4. **RTSP reconnect storms + stall-blindness (HIGH).** Existing `FfmpegManager` stall threshold (320s) is tuned for on-demand + warm-up forgiveness and is too long for always-on. New threshold: 60–90s using MediaMTX's `/v3/paths/get/trask` `ready: true` + `bytesReceived` advancing as primary liveness. Backoff: 1s → 2s → 4s → 8s → 16s → 30s cap; reset on 60s clean uptime. Camera configured for fixed closed 2s GOP so every reconnect resumes on a keyframe boundary within 2s.
5. **HLS discontinuity + segment-numbering on restart (HIGH).** MediaMTX handles `EXT-X-DISCONTINUITY` automatically on muxer restart — but supervisor-driven MediaMTX process restarts may reset the segment counter while CF/Bunny has 24h-immutable-cached `.ts` files. Mitigation: verify MediaMTX v1.17.1 segment-filename uniqueness across restarts in P2; if not unique by default, render a boot-unique epoch/token into `mediamtx.yml` via `scripts/render-config.ts`. Cutover-restart smoke test is a non-negotiable P7 item.
6. **Browser codec mismatch (HIGH → CRITICAL if it slips).** If camera ever emits H.265 (firmware default-reset, bandwidth tweak), MediaMTX passthrough produces HLS that Chrome/Firefox/Edge can't decode but Safari can — "works for me" bug. **Supervisor codec guard**: refuse to enter `ready` unless `/v3/paths/get/trask` reports `codec: "H264"`; `/health` exposes the codec for an ops `curl`.
7. **Monorepo type drift (MEDIUM).** `packages/shared` must not leak Cloudflare Workers types into the Node-target `packages/stream`. tsconfig `lib: ["es2023"]`, `types: ["node"]` (not `@cloudflare/workers-types`); ESM-only (`"type": "module"` in package.json, `.js` extensions on relative imports per `nodenext`). Turbo pipeline with explicit `inputs`/`outputs` to avoid cross-package cache pollution; CI smoke: `turbo run build --filter=stream` from a clean clone + `node --check dist/index.js`.

See: [`PITFALLS.md`](./PITFALLS.md) for severity scale, full 10-pitfall catalog, "Looks Done But Isn't" P7/P10 gate checklist, and recovery runbooks.

## Implications for Roadmap

The research converges on a **12-step build order** already drafted in ARCHITECTURE.md §"Build Order". It maps naturally to a smaller set of phases. The two P0 gates (CF ToS and CGNAT) sit **before** any code work and block architecture/stack sections that assumed the wrong answer.

### Phase 0: Milestone Gates (no code)

**Rationale:** Two decisions override parts of STACK/ARCHITECTURE. Make them before committing phase effort against the wrong assumption.
**Delivers:** PROJECT.md Key Decisions entries for (a) grey-cloud vs Bunny.net vs R2 and (b) direct-pull vs Pi-Tailscale-bridge (contingent on CGNAT test). STACK.md §"Cloudflare CDN Configuration" and ARCHITECTURE.md §"Cloudflare Config" marked reference-only if grey-cloud chosen.
**Addresses:** Pitfalls 1 (CF ToS) and 9 (CGNAT).
**Avoids:** Rewriting cache-rules work at cutover; discovering CGNAT at P7 smoke after all code is written.

### Phase 1: `packages/stream` skeleton

**Rationale:** Every subsequent phase depends on a working package with correct tsconfig + ESM + Pino. Gets the monorepo pitfall (10) off the table first.
**Delivers:** `packages/stream/` with `index.ts`, `config.ts` (zod over env), `logger.ts`, Fastify `http-server.ts` serving a placeholder `/health`, `package.json` (`"type": "module"`, `engines.node: ">=22"`), `tsconfig.json` (Node-target, no DOM/Workers types), Turbo pipeline entry, CI smoke (`turbo run build --filter=stream` from clean clone + `node --check dist/index.js`). Mirrors `packages/relay/src/` structure.
**Uses:** Fastify 5.8.5, Pino 10.3.1, zod, execa 9, TypeScript.
**Avoids:** Pitfall 10 (Workers types leaking into Node; ESM/CJS surprises).

### Phase 2: MediaMTX supervisor + spawn/backoff + stall watchdog

**Rationale:** Hot path of the whole milestone. Exponential backoff and stall detection are the two things that turn a demo into an always-on service.
**Delivers:** `supervisor.ts` state machine (`starting → ready → degraded ⇌ backoff`), `mediamtx.ts` execa wrapper (SIGTERM→10s→SIGKILL; stderr → pino JSON), `mediamtx-client.ts` (:9997 API probe). Backoff: 1→30s cap; stall threshold 60–90s via `bytesReceived` + `ready`. Codec guard refuses `ready` unless `H264`. `mediamtx.yml` template in `config/` with 2s segments, 6-segment window, `hlsAllowOrigin: "*"`. Boot-unique filename epoch resolved (test MediaMTX default behavior first).
**Implements:** ARCHITECTURE.md §"`packages/stream` Internal Architecture"; Pattern 1 (Mirror relay's supervisor).
**Addresses:** Pitfalls 2 (reconnect storm), 3 (discontinuity/numbering), 6 (process leaks — systemd unit with `StartLimitBurst=10`, `MemoryMax=1G`, `LimitNOFILE=65536`), 7 (codec guard).

### Phase 3: `/health` endpoint + ops surface

**Rationale:** Needed before external smoke and before the web side can reason about `degraded`. Cheap now, expensive to retrofit.
**Delivers:** Fastify `GET /health` returning `{ status, rtspConnected, codec, lastSegmentWrittenAgoMs, restartsLast1h, uptimeMs }`. Bound to Tailscale interface or grey-cloud `ops.stream.traskriver.com`. **Never fronted on public `stream.traskriver.com`** (Anti-Pattern 1).
**Addresses:** Pitfall 6 observability; enables Pitfall 7 codec visibility.

### Phase 4: `packages/shared` subpath split

**Rationale:** Parallelizable with P2/P3. Unblocks cutover deletions in P9 without forcing a one-shot shared-types surgery.
**Delivers:** Move `DemandResponse`, `RelayState`, `RelayStatusPayload`, etc. to `packages/shared/src/relay.ts` exported via `./relay` subpath in `package.json`. Root `index.ts` near-empty. `packages/relay/src/*` imports updated to `@traskriver/shared/relay`.
**Addresses:** Pitfall 10 cross-runtime type leakage; enables clean `packages/web` deletions.

### Phase 5: VPS provisioning + DNS + (grey-cloud) Cloudflare

**Rationale:** Parallel with P2–P4. User-owned work; blocks only P7 smoke.
**Delivers:** VPS with MediaMTX binary at `/opt/stream/mediamtx`, systemd unit `stream.service` (`Restart=always`, resource limits, `RuntimeDirectory=stream` for tmpfs), journald retention (`SystemMaxUse=500M`). DNS: `stream.traskriver.com` **grey-cloud** to VPS IP; `ops.stream.traskriver.com` grey-cloud with optional CF Access. `Cache-Control` headers correct at origin for future CDN reinstatement even though CF doesn't apply them under grey-cloud. TLS: Let's Encrypt or Cloudflare Origin CA (latter requires orange-cloud; under grey-cloud use Let's Encrypt).
**Addresses:** Pitfalls 1 (grey-cloud path), 4 (cache stampede prevention stays correct at origin), 6 (journald retention).

### Phase 6: DDNS + port-forward + camera config + CGNAT verification

**Rationale:** User-owned, parallel with P5. **P6 is where the second P0 gate resolves.** Blocker for P7.
**Delivers:** DDNS hostname resolving to home WAN; router 554/tcp forwarded to camera (and nothing else); UPnP disabled; camera H.264 fixed 2s closed GOP, 3–6 Mbps CBR; RTSP user with minimum privileges (20+ char password); `FIRMWARE.md` with model/firmware/CVE-pre-flight check. **CGNAT verification** from VPS via `nmap -p 554 cam.ddns.example`. If CGNAT detected, pivot to Pi-Tailscale-bridge (documented in P0 decision).
**Addresses:** Pitfalls 5 (camera security), 7 (codec at source), 9 (CGNAT gate).

### Phase 7: End-to-end smoke

**Rationale:** Depends on P2+P3+P5+P6. The "Looks Done But Isn't" checklist lives here.
**Delivers:** `curl stream.traskriver.com/trask/index.m3u8` returns manifest with correct headers; multi-browser playback (Chrome macOS/Windows, Firefox, Safari iOS/macOS — Safari-only passing is a failure); `kill -9 mediamtx` triggers supervisor restart with backoff; camera PoE-unplug flips `/health.rtspConnected: false` within 90s; `systemctl restart stream` produces `EXT-X-DISCONTINUITY` in manifest and viewers recover within buffer window; `nmap -p 554 cam.ddns.example` from VPS returns `open`.
**Addresses:** All pitfalls get their verification checkmark here.

### Phase 8: `packages/web` swap behind build-time env flag

**Rationale:** Precondition for cutover; serial with P7.
**Delivers:** `VideoPlayer.svelte` reads `PUBLIC_STREAM_HLS_URL`; adds manifest-freshness watcher dispatching `degraded`; keeps existing 10s fatal-error remount. Zod-validated env var on boot.
**Addresses:** Pitfall 8 (cutover requires a known-working URL first).

### Phase 9: State-machine collapse + route deletions

**Rationale:** Single-commit deletion set for reviewer clarity. Must come after P8 so the deletions don't orphan a live code path.
**Delivers:** Delete `routes/api/stream/demand/`, `routes/api/relay/status/`, `routes/api/test-kv/`, `routes/stream.remote.ts`, `lib/components/LiveViewerCount.svelte`, sidebar start button. Collapse `+page.svelte` state machine to `connecting / viewing / degraded / error`. Remove CF-Stream env bindings from `wrangler.jsonc` (keep `RIVER_KV` dormant). Telemetry footer reduced to static "Live" or deleted (milestone call; default static).
**Implements:** Pattern 3 (Deletion before addition in the cutover commit).

### Phase 10: Atomic cutover deploy

**Rationale:** Single `wrangler deploy` flips the viewer path. All earlier phases exist to make this one line safe.
**Delivers:** Cutover gate checklist all green (48h origin stability, `/health` clean, multi-browser verified, DNS TTL pre-shortened to 60s, CF Stream live input alive, Pi relay `inactive` but not `disabled`, `wrangler rollback` dry-run confirms previous version retrievable). Deploy. Immediate post-deploy verification: page loads, player reaches `viewing` within 5s, no 4xx to deleted routes in browser console.
**Addresses:** Pitfall 8 in full.

### Phase 11: 7-day watchful-silence observation

**Rationale:** Slow pitfalls (leaks, NAT-eviction cadence, CF ToS detector) surface on a days-to-week timescale.
**Delivers:** Daily `/health` + `journalctl -u stream` checks; PostHog dashboard for viewer analytics; no touching of Pi, CF Stream live input, CF KV entries, or dormant secrets during the window.
**Addresses:** Pitfalls 6 (observation window), 1 (CF ToS detector timing).

### Phase 12: Decommission

**Rationale:** Only after P11 confirms stability. Removing rollback assets prematurely converts a 10-min recovery into a 72-hour one.
**Delivers:** Pi: `systemctl stop river-relay river-relay-reset.timer river-relay-boot-sync.service && systemctl disable --now river-relay`. CF: delete Stream live input; remove `CF_STREAM_*` + `RELAY_API_TOKEN` from secrets. `packages/relay/README.md` banner: "Retired (v1.2). Cold fallback only." GitHub Actions workflow flips to `workflow_dispatch:` only.

### Phase Ordering Rationale

- **P0 is first because it rewrites P5's config surface.** If CF ToS forces grey-cloud, there's no point designing cache rules; if CGNAT forces Pi-bridge, `packages/stream` needs a different RTSP source URL and the Pi stays in the topology.
- **P1 → P2 → P3 is strictly serial** (skeleton emits config/logger/Fastify → supervisor consumes them → `/health` reads supervisor state). P4 runs in parallel with P2/P3 (no internal dependency).
- **P5 and P6 run in parallel** with P2–P4 — they're user-owned provisioning work, no code coupling until P7.
- **P7 → P8 → P9 → P10 are strictly serial** — can't flag-guard without a known-working origin URL (P7 before P8); can't delete without a known-working swap (P8 before P9); can't cutover without the full deletion commit (P9 before P10).
- **P11 is wall-clock waiting** but protects P12's safety budget. P12 runs only on ≥7 days of P11 green.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 2 (supervisor):** MediaMTX v1.17.1 segment-filename behavior across process restarts needs empirical verification before picking the "rely on default uniqueness" vs "render boot-epoch into yml" path. Also: whether MediaMTX emits `EXT-X-DISCONTINUITY` on graceful vs crash restarts — tested, not assumed.
- **Phase 5 (VPS + grey-cloud):** If grey-cloud is the P0 choice, egress bandwidth budgeting against VPS plan (~540 GB/month at steady 5 Mbps × modest viewership) needs a specific provider check. If Bunny.net is the P0 choice, their HLS header/cache config differs from CF and needs a standalone runbook.
- **Phase 6 (CGNAT + camera):** Camera model + firmware's exact CVE status. Requires the user to name the specific camera before CVE pre-flight can run as a codified check.

Phases with standard patterns (skip deeper research):

- **Phase 1 (skeleton):** Standard Node + Fastify + Pino + execa + tsconfig setup. No novelty.
- **Phase 4 (shared types split):** Mechanical `package.json` subpath export. No novelty.
- **Phase 8 (web swap):** Changing a `liveSrc` string + adding a hls.js `LEVEL_LOADED` watcher. Existing patterns in `VideoPlayer.svelte`.
- **Phase 9 (deletions):** Pure subtractive surgery; file-by-file deletion list already enumerated in ARCHITECTURE.md §"Files to modify".

## Confidence Assessment

| Area         | Confidence | Notes                                                                                                                                                                                                                                                                               |
| ------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack        | HIGH       | Library versions verified on npm registry + GitHub releases 2026-04-20; Context7 used for MediaMTX/go2rtc/node-media-server/Pino docs; caniuse.com for HEVC; existing relay code as supervision pattern reference.                                                                  |
| Features     | HIGH       | Segment/ffmpeg/discontinuity patterns corroborated across CDNsun, Vid.co, VajraCast, Dolby OptiView, ffmpeg mailing list, and existing `VideoPlayer.svelte` config. MEDIUM on viewer-count trade-off analysis and still-frame endpoint shape (pattern-level, not product-specific). |
| Architecture | HIGH       | Grounded in direct reads of `packages/web`, `packages/relay`, `packages/shared`, STACK.md, FEATURES.md, and PROJECT.md. MEDIUM on DDNS/port-forward specifics (user-owned infra, assumptions stated and flagged for P6).                                                            |
| Pitfalls     | HIGH       | Cloudflare ToS verified via primary sources dated 2025-09-12 and 2026-03-24. CVE data from CISA KEV + 2025/2026 advisories. ffmpeg/HLS reconnect patterns match STACK findings. MEDIUM on home-network/CGNAT specifics (user infra).                                                |

**Overall confidence:** HIGH, **conditional on P0 resolution**. The two P0 gates (CF ToS path and CGNAT test) can force topology changes (Pi stays as Tailscale bridge; no CDN in path) that are fully prepared for in the documents but require user decisions before roadmap locks.

### Gaps to Address

- **Camera model + firmware version** not named in PROJECT.md. Pitfall 5 CVE pre-flight needs this as an input. Resolve at the top of P6, or pull forward into P0 if the model is known.
- **VPS provider + bandwidth plan** not specified. Grey-cloud path (Pitfall 1 chosen) makes this materially load-bearing — 540 GB/month at steady state. Resolve in P0/P5.
- **Home ISP CGNAT status** unknown until P6 verification. If known now, can shift P0 decision on Pi retirement earlier.
- **MediaMTX segment-filename uniqueness across process restarts** — documented as requiring empirical verification in P2, not assumed.
- **Whether the user accepts reducing the telemetry footer to a static "Live" badge** or prefers deletion — a milestone-level UX call that Phase 9 depends on.

## Sources

### Primary (HIGH confidence)

- `/bluenviron/mediamtx` (Context7) + GitHub releases API — MediaMTX v1.17.1 (2026-03-31), HLS config, API endpoints.
- `/alexxit/go2rtc` (Context7) + GitHub releases API — v1.9.14 (2026-01-19), alternative RTSP→HLS path.
- npm registry — Fastify 5.8.5 (2026-04-14), Pino 10.3.1 (2026-02-09), hono 4.12.14 (2026-04-15), `node-media-server` 4.2.4 (RTMP-only), `fluent-ffmpeg` 2.1.3 (unmaintained since 2024-05).
- caniuse.com/hevc — browser HEVC support matrix Apr 2026; Chrome/Firefox/Edge all ≤ "partial".
- Cloudflare Service-Specific Terms (last updated 2026-03-24) — §"Content Delivery Network (Free, Pro, or Business)"; Cloudflare Self-Serve Subscription Agreement (2025-09-12); Cloudflare Fundamentals: "Delivering Videos with Cloudflare".
- Cloudflare Cache Rules + `CDN-Cache-Control` docs — TTL semantics.
- CISA Known Exploited Vulnerabilities Catalog — CVE-2021-33044/45 (Dahua, CVSS 9.8); CVE-2025-31700/31701 (Dahua); CVE-2025-65857 (Xiongmai XM530 hardcoded RTSP creds, no patch); CVE-2025-66176/66177 (Hikvision, LAN-adjacent).
- RFC 8216 (HLS) §4.3.3.2 `EXT-X-MEDIA-SEQUENCE`, §4.3.2.3 `EXT-X-DISCONTINUITY`.
- ffmpeg hlsenc cvslog — `append_list+discont_start+delete_segments+program_date_time` behavior.
- Existing codebase: `packages/web/src/lib/components/VideoPlayer.svelte`, `packages/web/src/routes/+page.svelte`, `packages/web/src/routes/stream.remote.ts`, `packages/web/src/routes/api/stream/demand/+server.ts`, `packages/web/src/routes/api/relay/status/+server.ts`, `packages/relay/src/ffmpeg.ts`, `packages/relay/src/state-machine.ts`, `packages/shared/index.ts`.
- `.planning/PROJECT.md` — milestone scope, camera/network constraints, public-HLS decision, relay-retained-as-cold-fallback decision.

### Secondary (MEDIUM confidence)

- VajraCast, Vid.co, CDNsun, Dolby OptiView — HLS segment-duration/latency tuning.
- ffmpeg-user mailing list (Jan 2025) — systemd `Restart=always` + `-timeout` pattern.
- Cloudflare community forum — CF ToS enforcement pattern evidence (community evidence HIGH as pattern, MEDIUM on exact thresholds).
- Bunny.net pricing docs (2026-04).

### Tertiary (LOW confidence)

- `umair-aziz025/dahua-cve-research` exploit repo — referenced for default-credentials attack tooling existence; not relied on for CVE technical detail.

---

_Research completed: 2026-04-20_
_Ready for roadmap: yes — conditional on P0 resolution (CF ToS path + CGNAT verification)_
