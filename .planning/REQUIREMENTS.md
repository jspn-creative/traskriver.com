# Requirements: Trask River Cam — v1.2 Self-Hosted Stream

**Milestone goal:** Replace Cloudflare Stream with an always-on `packages/stream` Node service on a DigitalOcean droplet that pulls RTSP directly from the camera and serves public HLS. Eliminate Cloudflare Stream's 30s cold-start, usage caps, and the Raspberry Pi relay dependency. Delivered on a new branch; merges when the web deployment works against the new backend — no parallel-run, no cutover, no rollback window.

## Milestone v1.2 Requirements

### Stream Service (`packages/stream`)

- [x] **STRM-01**: A new `packages/stream` Node 22 package is created with ESM, zod-validated config, Pino structured logging, and a `/health` HTTP endpoint (HTTP library choice deferred to phase planning — Fastify placeholder, alternatives to be evaluated).
- [x] **STRM-02**: The service supervises a MediaMTX child process, spawning/respawning it with exponential backoff (1→30s cap, reset on 60s clean uptime) and graceful shutdown (SIGTERM→10s→SIGKILL).
- [x] **STRM-03**: The service pulls RTSP from the Reolink RLC-510WA (main stream) continuously, 24/7, with automatic reconnection on camera disconnect.
- [x] **STRM-04**: A stall watchdog (60–90s threshold) detects stuck MediaMTX via `bytesReceived` + `ready: true` from MediaMTX's API and triggers a supervised restart.
- [x] **STRM-05**: A codec guard refuses to enter `ready` state unless the ingest track codec is `H264` (H.265 fails fast with a clear error).
- [x] **STRM-06**: MediaMTX is configured for H.264 passthrough (no transcode), 2s segments, 2s closed GOP, 6-segment playlist window, `EXT-X-DISCONTINUITY` on muxer restart.
- [x] **STRM-07**: HLS files are written to the runtime directory (`HLS_DIR`, defaulting to `/run/stream/hls` — tmpfs via `RuntimeDirectory=stream` in Phase 8) and served by MediaMTX on its HTTP origin port. `hlsAlwaysRemux: yes` keeps the muxer warm between viewers.
- [x] **STRM-08**: `/health` returns `{ status, rtspConnected, codec, lastSegmentWrittenAgoMs, restartsLast1h, uptimeMs }` and is bound to an ops-only interface (not the public HLS hostname).

### Deployment & Infrastructure (VPS + DNS + Camera)

- [ ] **INFRA-01**: The service runs on a DigitalOcean droplet under systemd (`Restart=always`, resource limits, journald retention capped ~500M). CI/CD is user-owned and out of scope.
- [ ] **INFRA-02**: `stream.traskriver.com` is configured in Cloudflare DNS, orange-cloud by default with grey-cloud documented as the fallback if Cloudflare's CDN-video ToS is enforced against the zone.
- [ ] **INFRA-03**: TLS termination on the droplet via Let's Encrypt with auto-renewal. OpenLiteSpeed (already installed) is the primary reverse proxy in front of MediaMTX's HLS origin port — Caddy is documented as a fallback if OLS config proves impractical. Proxy adds required HLS cache headers: `Cache-Control: public, max-age=1` on `.m3u8`, `public, max-age=86400, immutable` on `.ts`.
- [ ] **INFRA-04**: Home router forwards only port 554/tcp to the camera; UPnP disabled.
- [ ] **INFRA-05**: The Reolink camera is configured with a DDNS hostname, fixed H.264 output (2s closed GOP, 3–6 Mbps CBR), and a dedicated RTSP user (minimum privileges, 20+ char password) distinct from the admin account.
- [ ] **INFRA-06**: Camera firmware version is documented in a `FIRMWARE.md` note with the CVE pre-flight check completed at phase execution time.

### Web Client Migration (`packages/web`)

- [ ] **WEB-01**: `VideoPlayer.svelte` points at `PUBLIC_STREAM_HLS_URL` (new build-time env var); the existing CF-Stream-specific playback URL logic is removed.
- [ ] **WEB-02**: A manifest-freshness watcher (driven by hls.js `LEVEL_LOADED` / `EXT-X-MEDIA-SEQUENCE` progression) drives a new `degraded` page state; the browser no longer polls the origin's `/health`.
- [ ] **WEB-03**: The page state machine collapses to `connecting → viewing ⇌ degraded → error`. Start-button, demand POST, and relay-status polling are removed.
- [ ] **WEB-04**: Camera-offline UX shows a clear "Camera offline — retrying" overlay while in `degraded`, recovers automatically when segments resume.

### Cleanup & Deletions (same branch / same merge)

- [ ] **CLEAN-01**: Deleted: `packages/web/src/routes/stream.remote.ts`, `routes/api/stream/demand/`, `routes/api/relay/status/`, `routes/api/test-kv/`, `lib/components/LiveViewerCount.svelte`, sidebar stream start button.
- [ ] **CLEAN-02**: Deleted: Cloudflare Stream env bindings and secrets from `wrangler.jsonc`; `RIVER_KV` binding removed if no remaining consumers.
- [ ] **CLEAN-03**: Deleted: the entire `packages/relay` package and its GitHub Actions workflow + Tailscale CI documentation.
- [x] **CLEAN-04**: Deleted: all relay/demand/JWT/status types from `packages/shared`; root `index.ts` left clean.
- [ ] **CLEAN-05**: Workspace references (`turbo.json`, root `package.json`, tsconfig paths) updated to reflect removed `packages/relay` and added `packages/stream`.

## Future Requirements (Deferred)

Deferred to v1.3 or later:

- River conditions footer (sunrise/sunset, USGS flow/temp, fish run status) — see `BACKLOG.md`
- `/preview.jpg` latest-frame endpoint (dynamic poster, OG image, offline fallback)
- LL-HLS upgrade (MediaMTX config flip when latency matters)
- Pi repurposing (local recording, camera health monitor, etc.)

## Out of Scope (v1.2)

- **Recording / DVR** — live only.
- **Multi-quality ABR ladder** — single rendition.
- **WebRTC / sub-second latency** — HLS is fine for a river cam.
- **Multi-camera support** — single Trask camera.
- **Playback authentication / JWT signing** — stream is inherently public.
- **Parallel run / cutover / rollback window** — branch-based; app not actively used, simple merge when working.
- **CI/CD for the stream service** — user-owned via DigitalOcean, not a milestone concern.

## Traceability

| Requirement | Phase   | Status   |
| ----------- | ------- | -------- |
| STRM-01     | Phase 5 | Complete |
| STRM-02     | Phase 6 | Complete |
| STRM-03     | Phase 6 | Complete |
| STRM-04     | Phase 6 | Complete |
| STRM-05     | Phase 6 | Complete |
| STRM-06     | Phase 6 | Complete |
| STRM-07     | Phase 6 | Complete |
| STRM-08     | Phase 7 | Complete |
| INFRA-01    | Phase 8 | Pending  |
| INFRA-02    | Phase 8 | Pending  |
| INFRA-03    | Phase 8 | Pending  |
| INFRA-04    | Phase 8 | Pending  |
| INFRA-05    | Phase 8 | Pending  |
| INFRA-06    | Phase 8 | Pending  |
| WEB-01      | Phase 9 | Pending  |
| WEB-02      | Phase 9 | Pending  |
| WEB-03      | Phase 9 | Pending  |
| WEB-04      | Phase 9 | Pending  |
| CLEAN-01    | Phase 9 | Pending  |
| CLEAN-02    | Phase 9 | Pending  |
| CLEAN-03    | Phase 9 | Pending  |
| CLEAN-04    | Phase 7 | Complete |
| CLEAN-05    | Phase 9 | Pending  |

**Coverage:** 23/23 requirements mapped ✓ · No orphans · No duplicates

---

_Requirements defined: 2026-04-20_
