# Trask River Cam

## What This Is

A live-streaming web app for a river camera on the Trask River in Tillamook, OR. Users can start an on-demand video stream from a remote camera, watch live HLS video, and view local conditions. The primary audience is anglers checking river conditions before heading out.

## Core Value

Users can see the Trask River live, on-demand, from anywhere — the stream starts when they want it and shows real conditions.

## Current Milestone: v1.2 Self-Hosted Stream

**Goal:** Replace Cloudflare Stream with an always-on `packages/stream` Node service on our own VPS that pulls RTSP directly from the camera and serves public HLS via Cloudflare CDN — eliminating 30s cold-start, Cloudflare Stream usage limits, and the Pi relay dependency.

**Target features:**

- New `packages/stream` Node service: RTSP ingest → HLS origin (always-on)
- Direct camera pull via public port forward + DDNS (no Pi relay in the path)
- Public HLS playback (no JWT signing), Cloudflare CDN in front for fan-out
- `web` swap: replace Cloudflare Stream player + JWT flow with direct HLS URL
- Retire `packages/relay` from active deployment (kept in repo as documented cold fallback)
- Basic ops: systemd + `/health` + logs

## Previous Milestone: v1.1 Analytics & User-Ready Polish (SHIPPED 2026-04-20)

**Delivered:**

- PostHog analytics (replaced Counterscale)
- Sidebar content overhaul with branding, weather, and stream controls
- Copy cleanup for angler audience

**Not delivered (deferred to backlog):**

- River conditions data Phase 3 moved to BACKLOG.md

## Requirements

### Validated

<!-- Shipped and confirmed valuable — v1.0 capabilities. -->

- ✓ On-demand stream start via browser demand → relay → ffmpeg → Cloudflare Stream — v1.0
- ✓ HLS video playback with error recovery and stream state phases — v1.0
- ✓ Relay state machine with status reporting to KV — v1.0
- ✓ Responsive drawer/sidebar layout (mobile drawer, desktop sidebar) — v1.0
- ✓ Pass details panel with stream controls — v1.0
- ✓ Local weather display — v1.0
- ✓ Telemetry footer with encoding/bitrate info — v1.0
- ✓ Relay CI/CD deployment via Tailscale + GitHub Actions — v1.0
- ✓ Systemd service management on Raspberry Pi — v1.0

### Active

<!-- Current scope — v1.2 milestone. -->

- [ ] Self-hosted HLS origin service (`packages/stream`) running always-on on VPS
- [ ] Direct camera RTSP ingest via public port forward + DDNS
- [ ] Public HLS delivery with Cloudflare CDN in front
- [ ] Web client migration off Cloudflare Stream + JWT signing
- [ ] Retire Pi relay from active path (kept as documented cold fallback)

### Deferred to v1.3

- River conditions footer (sunrise/sunset, USGS flow/temp, fish run status) — see BACKLOG.md

### Validated

<!-- Shipped in v1.1 -->

- ✓ PostHog analytics (unique visitors, pageviews) — v1.1
- ✓ Sidebar content overhaul (branding, description, always-visible weather + controls) — v1.1
- ✓ Copy and content cleanup for angler audience — v1.1

### Out of Scope

<!-- Explicit boundaries. -->

- Real-time chat — Not relevant for a river cam
- User accounts/authentication — Stream is public, no user management needed
- Mobile native app — Web-first, responsive design covers mobile
- Multi-camera support — Single camera on the Trask for now
- Video recording/playback — Live only, no VOD

## Context

- **Deployment:** SvelteKit on Cloudflare Workers (web), Bun on Raspberry Pi (relay — retiring in v1.2), Node on xCloud-managed VPS (stream — v1.2)
- **Video pipeline (current, v1.0–v1.1):** RTSP camera → Pi ffmpeg → RTMPS → Cloudflare Stream → HLS
- **Video pipeline (target, v1.2):** RTSP camera (public via DDNS + port forward) → VPS `packages/stream` Node service → HLS → Cloudflare CDN → viewer
- **State coordination:** Cloudflare KV for demand signals and relay status (to be retired in v1.2 where unused)
- **Camera:** 2560×1920 sensor, adjustable bitrate/fps/i-frame interval, H.264 + H.265, CBR/VBR modes, supports RTSP and RTMP
- **Home network:** Trask site on TP-Link Deco mesh, 2Gbps plan but ~40Mbps sustained upload measured — well above single-stream needs
- **Analytics:** PostHog at `https://app.posthog.com/` (integrated via @posthog/sveltekit)
- **Data sources:** USGS gauges for live river data; fish run status will be static seasonal content (v1.3)
- **Audience:** Primarily anglers checking the Trask River before fishing trips
- **Monorepo:** `packages/web`, `packages/relay`, `packages/shared`, `packages/stream` (new, v1.2) with Turbo + Bun workspaces

## Constraints

- **Web platform**: Cloudflare Workers runtime — no Node.js APIs, Web Crypto only
- **VPS service (v1.2)**: Must be a long-running Node process, deployable by pulling from GitHub and running with no extra infra (xCloud-style). CI/CD is owned by the user and out of scope.
- **Home upload**: ~40Mbps sustained ceiling — sets upper bound on camera bitrate for direct pull
- **Camera security**: Direct port forward + DDNS, no IP allowlist available at router — must rely on strong credentials and limited-port exposure only
- **KV limits**: Free-tier write caps affect heartbeat frequency (relevant only while demand/status still in use)
- **Dependencies**: vidstack for HLS player — version-sensitive integration

## Key Decisions

| Decision                          | Rationale                                                                                                     | Outcome            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------ |
| Cloudflare Stream for video CDN   | Low-latency HLS with global edge, simple JWT signing                                                          | ✓ Good             |
| KV for demand/status coordination | Lightweight, no database needed for two keys                                                                  | ✓ Good             |
| On-demand streaming (not 24/7)    | Save bandwidth and compute on Pi; stream only when someone wants to watch                                     | ✓ Good             |
| Bun for relay runtime             | Fast startup, good subprocess management, runs well on Pi                                                     | ✓ Good             |
| PostHog for analytics             | Better features, easier integration, free tier generous                                                       | ✓ Good             |
| Counterscale for analytics        | Replaced by PostHog                                                                                           | — Replaced         |
| USGS API for river data           | Free, reliable public data for Trask River gauge                                                              | — Deferred to v1.3 |
| Static fish run table             | Seasonal patterns are predictable; avoids complex data sourcing                                               | — Deferred to v1.3 |
| Self-host stream on VPS (v1.2)    | Eliminates Cloudflare Stream 30s cold-start + usage caps; full control over pipeline                          | — Pending          |
| Direct camera RTSP pull (v1.2)    | Removes Pi relay from hot path; Pi was single point of failure. Trade: camera exposed via DDNS + port forward | — Pending          |
| Public HLS, no JWT signing (v1.2) | Stream is inherently public; signing added cost without benefit                                               | — Pending          |
| Cloudflare CDN in front (v1.2)    | Near-free fan-out; origin egress bounded regardless of viewer spikes                                          | — Pending          |
| Retire Pi relay from active path  | Direct pull eliminates need; kept in repo as documented cold fallback                                         | — Pending          |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-04-20 — milestone v1.2 Self-Hosted Stream started_
