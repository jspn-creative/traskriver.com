# Trask River Cam

## What This Is

A live-streaming web app for a river camera on the Trask River in Tillamook, OR. Users can start an on-demand video stream from a remote camera, watch live HLS video, and view local conditions. The primary audience is anglers checking river conditions before heading out.

## Core Value

Users can see the Trask River live, on-demand, from anywhere — the stream starts when they want it and shows real conditions.

## Current Milestone: v1.2 River Conditions Data

**Goal:** Add river conditions display (flow, temperature, sunrise/sunset, fish runs) with freshness indicators.

**Target features:**

- USGS gauge data for flow and temperature
- Sunrise/sunset times from Open-Meteo
- Seasonal fish run status
- Freshness indicators for all data

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

- [ ] River conditions footer (sunrise/sunset, USGS flow/temp, fish run status)

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

- **Deployment:** SvelteKit on Cloudflare Workers (web), Bun on Raspberry Pi (relay)
- **Video pipeline:** RTSP camera → ffmpeg → RTMPS → Cloudflare Stream → HLS
- **State coordination:** Cloudflare KV for demand signals and relay status
- **Analytics:** PostHog at `https://app.posthog.com/` (integrated via @posthog/sveltekit)
- **Data sources:** USGS gauges for live river data; fish run status will be static seasonal content
- **Audience:** Primarily anglers checking the Trask River before fishing trips
- **Monorepo:** `packages/web`, `packages/relay`, `packages/shared` with Turbo + Bun workspaces

## Constraints

- **Platform**: Cloudflare Workers runtime — no Node.js APIs, Web Crypto only
- **Edge relay**: Raspberry Pi with limited compute — ffmpeg is the bottleneck
- **KV limits**: Free-tier write caps affect heartbeat frequency
- **Dependencies**: vidstack for HLS player — version-sensitive integration

## Key Decisions

| Decision                          | Rationale                                                                 | Outcome    |
| --------------------------------- | ------------------------------------------------------------------------- | ---------- |
| Cloudflare Stream for video CDN   | Low-latency HLS with global edge, simple JWT signing                      | ✓ Good     |
| KV for demand/status coordination | Lightweight, no database needed for two keys                              | ✓ Good     |
| On-demand streaming (not 24/7)    | Save bandwidth and compute on Pi; stream only when someone wants to watch | ✓ Good     |
| Bun for relay runtime             | Fast startup, good subprocess management, runs well on Pi                 | ✓ Good     |
| PostHog for analytics             | Better features, easier integration, free tier generous                   | ✓ Good     |
| Counterscale for analytics        | Replaced by PostHog                                                       | — Replaced |
| USGS API for river data           | Free, reliable public data for Trask River gauge                          | — Pending  |
| Static fish run table             | Seasonal patterns are predictable; avoids complex data sourcing           | — Pending  |

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

_Last updated: 2026-04-20 after milestone v1.1 complete_
