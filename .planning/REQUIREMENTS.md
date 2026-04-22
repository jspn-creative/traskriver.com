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

### Web Client Migration (`packages/web`)

- [x] **WEB-01**: `VideoPlayer.svelte` points at `PUBLIC_STREAM_HLS_URL` (new build-time env var); the existing CF-Stream-specific playback URL logic is removed.
- [x] **WEB-02**: A manifest-freshness watcher (driven by hls.js `LEVEL_LOADED` / `EXT-X-MEDIA-SEQUENCE` progression) drives a new `degraded` page state; the browser no longer polls the origin's `/health`.
- [x] **WEB-03**: The page state machine collapses to `connecting → viewing ⇌ degraded → error`. Start-button, demand POST, and relay-status polling are removed.
- [x] **WEB-04**: Camera-offline UX shows a clear "Camera offline — retrying" overlay while in `degraded`, recovers automatically when segments resume.

### Cleanup & Deletions (same branch / same merge)

- [x] **CLEAN-01**: Deleted: `packages/web/src/routes/stream.remote.ts`, `routes/api/stream/demand/`, `routes/api/relay/status/`, `routes/api/test-kv/`, `lib/components/LiveViewerCount.svelte`, sidebar stream start button.
- [x] **CLEAN-02**: Deleted: Cloudflare Stream env bindings and secrets from `wrangler.jsonc`; `RIVER_KV` binding removed if no remaining consumers.
- [x] **CLEAN-03**: Deleted: the entire `packages/relay` package and its GitHub Actions workflow + Tailscale CI documentation.
- [x] **CLEAN-04**: Deleted: all relay/demand/JWT/status types from `packages/shared`; root `index.ts` left clean.
- [x] **CLEAN-05**: Workspace references (`turbo.json`, root `package.json`, tsconfig paths) updated to reflect removed `packages/relay` and added `packages/stream`.

## Future Requirements (Deferred)

Deferred to v1.3 or later:

- **INFRA-01**: systemd service (`Restart=always`, resource limits, journald retention ~500M)
- **INFRA-02**: Cloudflare DNS (`stream.traskriver.com`, orange-cloud default, grey-cloud fallback)
- **INFRA-03**: TLS via Let's Encrypt + OLS reverse proxy with HLS cache headers
- **INFRA-04**: Router port-forward (554/tcp only, UPnP disabled)
- **INFRA-05**: Camera DDNS, H.264 config, dedicated RTSP user
- **INFRA-06**: FIRMWARE.md + CVE pre-flight check
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
| INFRA-01    | v1.3    | Deferred |
| INFRA-02    | v1.3    | Deferred |
| INFRA-03    | v1.3    | Deferred |
| INFRA-04    | v1.3    | Deferred |
| INFRA-05    | v1.3    | Deferred |
| INFRA-06    | v1.3    | Deferred |
| WEB-01      | Phase 8 | Complete |
| WEB-02      | Phase 8 | Complete |
| WEB-03      | Phase 8 | Complete |
| WEB-04      | Phase 8 | Complete |
| CLEAN-01    | Phase 8 | Complete |
| CLEAN-02    | Phase 8 | Complete |
| CLEAN-03    | Phase 8 | Complete |
| CLEAN-04    | Phase 7 | Complete |
| CLEAN-05    | Phase 8 | Complete |

**Coverage:** 23/23 requirements mapped ✓ · No orphans · No duplicates

---

_Requirements updated: 2026-04-22 — INFRA-01 through INFRA-06 deferred to v1.3; WEB/CLEAN requirements promoted to Phase 8_
