# Feature Research — v1.2 Self-Hosted HLS Origin

**Domain:** Single-camera always-on public HLS live stream (prosumer river cam), self-hosted origin behind Cloudflare CDN.
**Researched:** 2026-04-20
**Confidence:** HIGH for segment/ffmpeg/discontinuity patterns (Context7-adjacent, official ffmpeg mailing list, multiple current sources agreeing). MEDIUM for viewer-count trade-off and still-frame endpoint shape (pattern-level, not product-specific). LOW for CF-specific log-push counting (skipped — out of scope).

---

## Framing

v1.2 is a **pipeline swap**, not a feature expansion. The UX goal is: page loads → picture in ~1–3s, no button, no warm-up. Most "features" below are really **behaviors the origin + player must get right** so the viewer sees live video quickly and gracefully degrades when the camera drops. Feature inventory is therefore small and deliberately boring — the differentiators are in polish (still-frame snapshot, camera-offline UX), not new UI.

Existing code we're building on:

- `packages/web/src/lib/components/VideoPlayer.svelte` — vidstack + hls.js with manifest probe, live-edge seek, fatal-error remount, back-buffer trim, `liveSyncDurationCount: 3`. **Already matches a 2-second-segment config well.**
- `packages/web/src/routes/+page.svelte` — 6-state page machine: `idle` / `starting` / `viewing` / `ended_confirming` / `ended` / `error` (+ `unavailable`). Most of this collapses in v1.2.
- `packages/relay/src/state-machine.ts` — stays idle in v1.2 active path; not used.

---

## Feature Landscape

### Table Stakes (MUST have for credible v1.2)

Features a viewer implicitly expects from "open page → watch river." Missing any = worse than Cloudflare Stream and not a viable cutover.

| Feature                                                    | Why Expected                                                                                                                                                                     | Complexity                    | Notes / Deps                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Always-on RTSP ingest with auto-reconnect**              | Camera dropouts are routine (Deco mesh, camera reboots, DDNS blips). Stream must self-heal without human intervention.                                                           | MEDIUM (~0.5–1 day)           | ffmpeg `-rtsp_transport tcp -timeout 5000000`, wrapped by systemd `Restart=always RestartSec=5` OR an in-process supervisor in `packages/stream`. Prefer in-process supervisor so `/health` can distinguish "ffmpeg respawning" from "service dead."                           |
| **Fast viewer join (~1–3s to first frame)**                | Core v1.2 value prop vs current 30s cold start.                                                                                                                                  | MEDIUM (tuning, not coding)   | 2s segments + GOP=2s (keyframe every 2s) + short playlist window (6 segments). No LL-HLS, no fMP4 parts — overkill for a river cam and adds CDN complexity. Existing hls.js config (`liveSyncDurationCount: 3`) is already correct. See **Segment Size Recommendation** below. |
| **Ingest-origin decoupling**                               | Viewer must not see ffmpeg subprocess state. If ffmpeg reconnects, playlist keeps serving last-known-good segments briefly; when new ones arrive, player resumes.                | MEDIUM                        | Segments written to disk (or tmpfs). HLS server reads from disk independently. `hls_flags +append_list+discont_start +delete_segments` on restart.                                                                                                                             |
| **EXT-X-DISCONTINUITY on origin restart**                  | Service restart (deploy/crash/systemd) without discontinuity tag causes PTS corruption and player stalls — documented widely.                                                    | LOW (one ffmpeg flag)         | `-hls_flags append_list+discont_start` persists sequence numbers across restarts and emits the discontinuity tag. hls.js handles it cleanly.                                                                                                                                   |
| **`/health` endpoint**                                     | Required for any ops model — systemd, uptime checks, debugging.                                                                                                                  | LOW (~2h)                     | Return JSON: `{ rtspConnected, lastSegmentWrittenAgoMs, segmentsWrittenLast60s, bytesPerSecIngress, uptimeMs }`. Do NOT include viewer count (origin can't see it; CF absorbs viewer traffic).                                                                                 |
| **Cache-correct HLS headers**                              | Misconfigured playlist caching causes stalled streams at the CDN edge.                                                                                                           | LOW (~1h)                     | `playlist.m3u8`: `Cache-Control: max-age=1` (half of segment duration). Segments (`*.ts`): `max-age=10, immutable`. Matches CDN guide recommendations.                                                                                                                         |
| **Graceful viewer experience when camera offline**         | Current model never had to handle this (on-demand: "no one home" = "don't start"). Now the origin runs, camera doesn't. See **Camera Disconnect Recommendation** below.          | MEDIUM (~0.5 day)             | Recommended approach: stop writing new segments, serve playlist truncated to last valid segments, mark player UI as "camera offline — retrying."                                                                                                                               |
| **Simplified page state machine**                          | Current 6-state machine exists because of demand-start flow. Remove `starting` / `ended_confirming` / `ended` / `unavailable`; they're artifacts of Cloudflare Stream lifecycle. | LOW (~2h, net code reduction) | New states: `connecting` (initial manifest probe), `viewing`, `degraded` (origin healthy, camera offline), `error` (origin unreachable / manifest failing). No user-initiated start = no `idle`.                                                                               |
| **Stream page loads without server round-trip for demand** | Current page does `POST /api/stream/demand` on load. Remove.                                                                                                                     | LOW (~1h, net delete)         | Pure static HLS URL in `VideoPlayer`. Kills `/api/stream/demand`, `/api/relay/status`, JWT signing path.                                                                                                                                                                       |

### Differentiators (worth the small extra time, clear user benefit)

Improvements over the current Cloudflare Stream experience that a self-hosted origin makes trivial.

| Feature                                         | Value Proposition                                                                                                                                                                       | Complexity                                            | Notes / Deps                                                                                                                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Latest-frame JPEG endpoint** (`/preview.jpg`) | OG image, social cards, email previews, fallback poster, "peek" before committing to stream. Anglers: "quick check before I pour coffee."                                               | LOW (~2–4h)                                           | Second ffmpeg output or `-vf fps=1/5 -update 1 snapshot.jpg` alongside HLS. Serve with short CDN TTL (5–10s). Cheap because ffmpeg already has the decoded frame. Unblocks richer social sharing. |
| **Camera-offline placeholder UI**               | Instead of a frozen frame or player error, show poster + "Camera is offline — retrying" with last-known frame behind it (from `/preview.jpg` if recent). Feels intentional, not broken. | LOW (~2h)                                             | Piggybacks on `/health` state + existing poster pattern in `VideoPlayer.svelte`.                                                                                                                  |
| **Origin uptime in telemetry footer**           | Existing footer already shows encoding/bitrate. Add "stream uptime 3d 14h." Cheap trust signal.                                                                                         | LOW (~1h)                                             | `/health` already exposes `uptimeMs`. Wire into existing telemetry component.                                                                                                                     |
| **Dynamic poster from latest frame**            | Player poster (`default.jpg`) is a stale stock photo. Swap for live `/preview.jpg` with 1-min browser cache. Page feels current even before player loads.                               | LOW (~1h)                                             | Pure `VideoPlayer` prop change; no backend work beyond `/preview.jpg`.                                                                                                                            |
| **`program-date-time` tag in playlist**         | Real clock time on each segment — gives viewers/future-you a wall-clock reference, helps debug drift.                                                                                   | LOW (one ffmpeg flag: `-hls_flags program_date_time`) | Zero UX cost, free observability.                                                                                                                                                                 |

### Anti-Features (explicitly NOT in v1.2)

Streaming-platform features that look valuable but either duplicate CF, bloat scope, or lock us out of a lean single-camera design.

| Feature                                | Why It Looks Appealing                    | Why Not (v1.2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Alternative                                                                                                                                                         |
| -------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LL-HLS / fMP4 parts**                | "Lowest latency" sells well in marketing. | Standard HLS @ 2s segments gets ~4–8s end-to-end latency, which is fine for a river. LL-HLS requires chunked-transfer-aware CDN config, fMP4 muxer complexity, and player tuning for a benefit no angler will notice.                                                                                                                                                                                                                                                               | Standard HLS, 2s segments. Revisit only if someone asks for sub-3s.                                                                                                 |
| **Multi-rendition (ABR) ladder**       | "Adapt to viewer bandwidth."              | Single camera, single-origin CPU, home upload capped at ~40Mbps, audience is desktop + mobile on WiFi. One 720p-equivalent rendition with `-c:v copy` is enough. Transcoding = CPU on the VPS for no validated benefit.                                                                                                                                                                                                                                                             | Single rendition, `-c:v copy` from camera. Add a rendition only if viewer-side analytics show sustained rebuffer.                                                   |
| **Transcoding / re-encode**            | "Normalize bitrate, fix camera quirks."   | Camera already produces well-formed H.264. Transcoding burns CPU, adds latency, creates a single point of failure for video quality.                                                                                                                                                                                                                                                                                                                                                | Tune the camera, not the pipeline. `-c:v copy` throughout.                                                                                                          |
| **Recording / DVR / VOD**              | "Let viewers scrub back."                 | Explicitly out of scope per milestone. Adds storage, retention policy, UI states, legal considerations (private-land recording).                                                                                                                                                                                                                                                                                                                                                    | Architecturally: keep segments on tmpfs, don't design any API around playlist history. Easy to add later by mounting durable storage + increasing `-hls_list_size`. |
| **Auth / signed URLs**                 | "Protect the stream."                     | Stream is intentionally public. Signing was a Cloudflare Stream requirement we're leaving behind. Decision already logged in `PROJECT.md`.                                                                                                                                                                                                                                                                                                                                          | Nothing. Public HLS URL.                                                                                                                                            |
| **DRM**                                | "Prevent embedding."                      | River cam.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | N/A                                                                                                                                                                 |
| **Multi-camera support**               | "Prepare for expansion."                  | YAGNI. v1.2 is already a rewrite; premature abstraction will complicate `packages/stream` and `/preview.jpg` endpoints.                                                                                                                                                                                                                                                                                                                                                             | Keep `packages/stream` config as a single camera object. When/if a second camera ships, refactor then. Code stays small.                                            |
| **Real-time chat**                     | "Community."                              | Already out of scope in `PROJECT.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                               | —                                                                                                                                                                   |
| **Viewer count on stream page**        | "Is anyone watching?"                     | Origin can't see it (CF absorbs ~all traffic). Options: (a) CF Logpush → parse → expose — heavy, external deps, costs money; (b) client-side heartbeat to a counter — re-introduces the KV polling we're retiring; (c) PostHog live counts — already have PostHog, but it doesn't expose real-time server-side. **Recommend: skip for v1.2.** Cut the existing "live viewer count" feature or move it to PostHog dashboard only (not on page). See **Viewer Count Decision** below. | Retire on-page counter. Keep PostHog for retrospective analytics.                                                                                                   |
| **Stream quality telemetry dashboard** | "Observability is good."                  | `/health` + systemd logs + PostHog is enough for a one-person operator. A Grafana stack is overkill.                                                                                                                                                                                                                                                                                                                                                                                | `journalctl` + `/health` curl.                                                                                                                                      |
| **WebRTC fallback**                    | "Sub-second latency."                     | Completely different transport, needs TURN server, doesn't survive CF CDN fan-out.                                                                                                                                                                                                                                                                                                                                                                                                  | N/A for river cam.                                                                                                                                                  |

---

## Key Recommendations (pulled out for ROADMAP author)

### Segment Size: **2 seconds, playlist window = 6 segments, GOP=2s**

**Rationale:**

- Player must buffer at least one full segment before decoding. 2s is the shortest segment that's reliably cacheable by a standard CDN without chunked-transfer tuning.
- With `liveSyncDurationCount: 3` (already in our hls.js config), player targets 3 segments behind live edge → steady-state latency ~6s, first-frame time ~2–4s on a warm CDN edge.
- 6-segment window = 12s of history. Enough to absorb a transient CF edge miss; short enough to not balloon manifest parse time.
- GOP must equal segment duration so every segment starts with a keyframe (critical for player join & ABR-future-proofing).
- Re-checked against current `VideoPlayer.svelte`: `liveSyncDurationCount: 3`, `liveMaxLatencyDurationCount: 5`, `backBufferLength: 10` — **all compatible with 2s segments; no player changes needed.**

Equivalent ffmpeg settings (copy codec where possible):

```
-c:v copy -f hls
-hls_time 2 -hls_list_size 6
-hls_flags append_list+discont_start+delete_segments+program_date_time
-hls_segment_type mpegts
```

Trade-offs considered:

- **1s segments:** Faster join, but doubles request rate, more CDN-sensitive, and the camera GOP would need retuning to match. Marginal benefit for a non-interactive stream.
- **4–6s segments:** Simpler, more forgiving of CDN hiccups, but viewer join time regresses to 4–8s first frame. Loses the headline v1.2 win.

**Confidence:** HIGH — matches multiple independent current sources (CDNsun, Vid.co, VajraCast, Dolby OptiView) and our player is already configured for it.

### Camera Disconnect UX: **Stop writing, serve truncated playlist, show "Camera offline" overlay**

Evaluated options (from the research question):

1. **Keep serving stale manifest with frozen segments** — ❌ Bad UX. Viewer sees a frozen frame indistinguishable from "paused" or "bug." No recovery signal.
2. **Serve offline-loop placeholder video from disk** — ❌ Misleading. Viewer might think they're watching live. Also: more ffmpeg complexity (second input, seamless cut-over).
3. **Serve nothing, viewer sees playback error** — ❌ Current `VideoPlayer` treats this as a fatal error with 10s remount timer. Creates a flapping loop on a flaky camera and a generic error state.
4. ✅ **Recommended: origin stops writing new segments when ingest drops; playlist naturally runs to its last segment; player surfaces a new `degraded` page state that shows the existing poster + "Camera offline — retrying."** Meanwhile `packages/stream` keeps trying to reconnect in the background. When reconnect succeeds, new segments appear with an `EXT-X-DISCONTINUITY` tag (already emitted by `discont_start` flag on any ingest gap), player resumes.

Why (4) beats the others:

- **Honest signaling:** Viewer knows immediately that it's not their network or the site.
- **Cheap:** No extra ffmpeg pipeline for placeholder loop. No special-case video file.
- **Recoverable:** When camera returns, discontinuity handling is already in the HLS spec and hls.js supports it.
- **Leverages `/preview.jpg`:** If we build the still-frame endpoint (differentiator), the last-captured frame becomes the "offline" poster — a much better fallback than the stock image.

Page state addition: `degraded` — derived from `/health` showing `rtspConnected: false` AND `lastSegmentWrittenAgoMs > 10000`. Poll `/health` every 5–10s while `viewing` to detect.

### Viewer Count: **Retire the on-page counter. Use PostHog for retrospective analytics only.**

The current "live viewer count polling" feature exists because we had a demand-based system where the Pi needed to know if anyone was watching (to stop ffmpeg and save upload). In v1.2 nobody needs to know that — the stream runs regardless.

- **Origin can't count** — CF CDN absorbs ~all viewer requests; origin sees a handful of edge fetches.
- **CF Logpush parsing** — real-time-ish with work, but introduces S3 or similar, cost, and a parser. Not worth it for v1.2.
- **Client heartbeat to KV/backend** — re-introduces the KV poll overhead we're retiring, and its accuracy (given CDN caching + mobile backgrounding) is poor.
- **PostHog** — already integrated, already captures pageview/heartbeat events. Use PostHog's dashboard for "how many people watched yesterday." Don't show a live count on the page.

**Action for ROADMAP:** explicitly include "remove live viewer count display from sidebar" as a task, or decide to leave the component but feed it a static "You're watching live" message. Flagged for milestone-level call; either is fine. No-count is my recommendation.

### Page State Machine Simplification

Current states (from `packages/web/src/routes/+page.svelte`):

```
idle → starting → live/viewing → ended_confirming → ended
                       ↘ unavailable
                       ↘ error
```

Proposed v1.2 states:

```
connecting → viewing ⇌ degraded
      ↘ error (origin/manifest unreachable, with remount timer)
```

Mapping:

- `idle` → gone (no user start).
- `starting` → gone (no warm-up).
- `unavailable` → gone (no CF Stream lifecycle).
- `ended` / `ended_confirming` → gone (stream never "ends").
- `error` → stays, scoped to "origin unreachable / fatal hls.js error." Keep existing 10s remount.
- `degraded` → new, driven by `/health` polling when camera drops mid-session.

**Net code impact:** smaller state machine, less polling (`/api/relay/status` disappears), fewer effects in `+page.svelte`. Estimated **~1 day** including the sidebar UI updates (removing start button, adjusting copy).

---

## Feature Dependencies

```
Always-on RTSP ingest (auto-reconnect)
    └──enables──> Always-on HLS segments on disk
                       └──enables──> Public HLS URL (CDN-fronted)
                                          └──enables──> Fast viewer join (~1–3s)
                                          └──enables──> Simplified page state machine
                                                             └──enables──> Remove /api/stream/demand + relay polling

Always-on HLS segments
    └──enables──> EXT-X-DISCONTINUITY on restart
                       └──enables──> Graceful ffmpeg respawn (camera-offline UX)

/health endpoint
    └──enables──> Degraded page state
    └──enables──> Uptime in telemetry footer

Latest-frame JPEG endpoint
    └──enables──> Dynamic poster
    └──enables──> OG image / social cards
    └──enhances──> Camera-offline placeholder UI
```

Notable: **`/preview.jpg` is the highest leverage differentiator** — it feeds three separate UX improvements for ~2–4h of work.

---

## MVP Definition

### Launch With (v1.2 cutover)

Everything in **Table Stakes** plus the two lowest-cost differentiators. Anything else can ship as a v1.2.x follow-up.

- [ ] Always-on RTSP ingest with auto-reconnect (supervised ffmpeg in `packages/stream`)
- [ ] HLS origin serving 2s segments with correct cache headers and discontinuity handling
- [ ] `/health` endpoint with the five fields listed above
- [ ] Cloudflare CDN in front of origin (no code, config only — user-owned)
- [ ] Web client: swap `liveSrc` to origin URL, delete JWT + CF Stream SDK path
- [ ] Page state machine simplified to `connecting / viewing / degraded / error`
- [ ] Camera-offline UX (`degraded` state → poster + "Camera offline, retrying" overlay)
- [ ] Live viewer count removed from sidebar (or static copy replacement — pending milestone call)
- [ ] `/preview.jpg` endpoint (enables dynamic poster + OG image + better offline fallback)

### Add After Validation (v1.2.x)

Ship once v1.2 is live and stable for a week.

- [ ] Dynamic poster from `/preview.jpg` — trivial, but de-risks by landing after player stability confirmed.
- [ ] Origin uptime in telemetry footer — nice polish, not urgent.
- [ ] OG image pointing at `/preview.jpg` — marketing polish.

### Future Consideration (v1.3+)

- [ ] DVR / short-replay — only if users ask. Architecture already permits it (just increase `hls_list_size` and point CDN at durable storage).
- [ ] Multi-rendition ABR — only if viewer-side analytics show rebuffer >2%.
- [ ] LL-HLS — only if a use case emerges demanding <3s latency. River cam doesn't.

---

## Feature Prioritization Matrix

| Feature                                        | User Value                      | Implementation Cost | Priority |
| ---------------------------------------------- | ------------------------------- | ------------------- | -------- |
| Always-on RTSP ingest + auto-reconnect         | HIGH                            | MEDIUM              | P1       |
| Fast viewer join (2s segments, correct config) | HIGH                            | LOW (tuning)        | P1       |
| Simplified page state machine                  | HIGH (UX: no warm-up feel)      | LOW                 | P1       |
| EXT-X-DISCONTINUITY on restart                 | HIGH (prevents broken playback) | LOW                 | P1       |
| `/health` endpoint                             | MEDIUM (ops)                    | LOW                 | P1       |
| Camera-offline (`degraded`) UI                 | HIGH (honest signaling)         | LOW                 | P1       |
| `/preview.jpg` still-frame endpoint            | MEDIUM (3 downstream wins)      | LOW                 | P1       |
| Dynamic poster from preview                    | LOW–MEDIUM                      | LOW                 | P2       |
| Uptime in telemetry footer                     | LOW                             | LOW                 | P2       |
| `program-date-time` tag                        | LOW (observability)             | trivial             | P2       |
| On-page viewer count                           | LOW (and costly to do right)    | HIGH                | **Cut**  |
| LL-HLS                                         | LOW (no need)                   | HIGH                | **Cut**  |
| ABR ladder                                     | LOW (single rendition fine)     | HIGH                | **Cut**  |
| Recording / DVR                                | MEDIUM (future)                 | HIGH                | P3       |

---

## Dependencies on Existing Code

| Existing code                                          | Change needed                                                                                                                                                                                                                                                         | Risk                                              |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `packages/web/src/lib/components/VideoPlayer.svelte`   | Keep manifest probe (still useful — origin may be mid-restart when page loads); keep hls.js config (already tuned for 2s segments); remove CF Stream-specific 204 handling; possibly simplify multi-level vs single-level playlist logic (origin emits single-level). | LOW — changes are subtractive.                    |
| `packages/web/src/routes/+page.svelte`                 | Delete `demand*` / `polling` / `lastKnownRelayState` / `relay*` state; collapse phase enum; remove `/api/stream/demand` + `/api/relay/status` callers; wire `/health` polling for `degraded`.                                                                         | MEDIUM — touches a lot of lines but net deletion. |
| `packages/web/src/routes/api/stream/demand/+server.ts` | Delete.                                                                                                                                                                                                                                                               | LOW                                               |
| `packages/web/src/routes/api/relay/status/+server.ts`  | Delete.                                                                                                                                                                                                                                                               | LOW                                               |
| `packages/relay/src/state-machine.ts`                  | Untouched. Relay kept as documented cold fallback per `PROJECT.md`.                                                                                                                                                                                                   | NONE                                              |
| Sidebar "live viewer count" component                  | Remove or replace with static copy.                                                                                                                                                                                                                                   | LOW                                               |
| Sidebar "start stream" button                          | Remove. Replace with static "Watching live" / fullscreen entry.                                                                                                                                                                                                       | LOW                                               |
| Telemetry footer (encoding/bitrate)                    | Source from `/health` instead of relay status.                                                                                                                                                                                                                        | LOW                                               |
| JWT signing (CF Stream)                                | Delete the whole module + env vars.                                                                                                                                                                                                                                   | LOW                                               |

**No new dependencies required on the web side.** `packages/stream` is the new package; its deps are ffmpeg (system) + a tiny Node HTTP server (`node:http` is sufficient — no framework needed).

---

## Sources

- **VajraCast — HLS Adaptive Streaming Setup Guide** (2025) — segment duration/latency table, keyframe alignment guidance. HIGH. https://vajracast.com/blog/hls-adaptive-streaming-setup/
- **Vid.co — Segment Duration Tuning** — standard-live vs low-latency segment trade-offs. MEDIUM–HIGH.
- **CDNsun — Low-Latency HLS production guide** — playlist TTL recommendations, cache-header pattern. HIGH (current, production-oriented).
- **Dolby OptiView — LL-HLS optimization** — GOP/segment/part interaction, reason to stick with standard HLS for non-interactive. HIGH.
- **32blog — RTSP with FFmpeg** — `-rtsp_transport tcp` + auto-reconnect wrapper pattern, `-timeout` semantics. MEDIUM.
- **ffmpeg-user mailing list (Jan 2025)** — systemd `Restart=always` + `-timeout` for clean RTSP reconnect. HIGH (current, authoritative).
- **ffmpeg hlsenc commit history (cvslog)** — `append_list+discont_start` behavior on restart, persisted `EXT-X-DISCONTINUITY`. HIGH (source code of record).
- **StackOverflow — Restartable HLS encoding in ffmpeg** — `-hls_playlist_type event -hls_flags append_list` pattern. MEDIUM.
- **PROJECT.md** — milestone scope, decisions, out-of-scope list.
- **Existing codebase** (`VideoPlayer.svelte`, `+page.svelte`, `state-machine.ts`) — current behavior to preserve/simplify.

---

_Feature research for: v1.2 Self-Hosted HLS Origin (traskriver.com)_
_Researched: 2026-04-20_
