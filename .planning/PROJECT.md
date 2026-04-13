# Trask River Cam

## What This Is

A live-streaming web app for a river camera on the Trask River in Tillamook, OR. Users can start an on-demand video stream from a remote camera, watch live HLS video, and view local conditions. The primary audience is anglers checking river conditions before heading out.

## Core Value

Users can see the Trask River live, on-demand, from anywhere — the stream starts when they want it and shows real conditions.

## Current Milestone: v1.2 Stream Reliability & Error Handling

**Goal:** Fix HLS playback reliability so the stream starts consistently across all browsers without excessive retries, console noise, or user-visible errors.

**Target features:**

- Replace destructive remount retry loop with HLS.js-native error recovery
- Proper stream startup state that expects empty manifests during Cloudflare Stream warmup
- Longer JWT TTL to prevent token expiry during retries
- Clean up console logging noise
- Fix Counterscale CORS configuration

## Previous Milestones

### v1.1 Analytics & User-Ready Polish (COMPLETE 2026-04-11)

- Counterscale analytics (ANLY-01, ANLY-02)
- Sidebar content overhaul for anglers (SIDE-01–SIDE-04)
- River conditions data in sidebar (RIVR-01–RIVR-04, FOOT-01)
- 3/3 phases, 11/11 requirements delivered

## Requirements

### Validated

<!-- Shipped and confirmed valuable — v1.0 capabilities. -->

- ✓ On-demand stream start via browser demand → relay → ffmpeg → Cloudflare Stream — v1.0
- ✓ HLS video playback with error recovery and stream state phases — v1.0
- ✓ Relay state machine with status reporting to KV — v1.0
- ✓ Responsive drawer/sidebar layout (mobile drawer, desktop sidebar) — v1.0
- ✓ Angler-focused sidebar: Trask River branding, always-visible weather, sticky stream CTA — Phase 2 (SIDE-01–SIDE-04); product-style PassDetailsPanel removed
- ✓ Local weather display — v1.0
- ✓ River conditions in sidebar (USGS flow/temp, freshness, sunrise/sunset, fish runs); telemetry bitrate footer removed — Phase 3 (RIVR-01–RIVR-04, FOOT-01)
- ✓ Relay CI/CD deployment via Tailscale + GitHub Actions — v1.0
- ✓ Systemd service management on Raspberry Pi — v1.0
- ✓ Counterscale production pageviews (apex + www) — Phase 1 (ANLY-01, ANLY-02)
- ✓ HLS playback reliability: HLS.js-first recovery, startup-tolerant manifest errors, 3600s signed URL TTL, dev-only stream logs, `ended_confirming` only after `viewing` — Phase 01 (STRM-01–STRM-05)

### Active

<!-- Current scope — v1.2 milestone. -->

- [ ] Fix Counterscale CORS headers on Worker (CORS-01)
- [ ] Counterscale engagement / custom events (ANLY-03, deferred to v1.x)

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
- **Analytics:** Counterscale tracker integrated in `packages/web` root layout → `counterscale.jspn.workers.dev`
- **Data sources:** USGS gauges for live river data; fish run status will be static seasonal content
- **Audience:** Primarily anglers checking the Trask River before fishing trips
- **Monorepo:** `packages/web`, `packages/relay`, `packages/shared` with Turbo + Bun workspaces

## Constraints

- **Platform**: Cloudflare Workers runtime — no Node.js APIs, Web Crypto only
- **Edge relay**: Raspberry Pi with limited compute — ffmpeg is the bottleneck
- **KV limits**: Free-tier write caps affect heartbeat frequency
- **Dependencies**: vidstack for HLS player — version-sensitive integration

## Key Decisions

| Decision                          | Rationale                                                                 | Outcome |
| --------------------------------- | ------------------------------------------------------------------------- | ------- |
| Cloudflare Stream for video CDN   | Low-latency HLS with global edge, simple JWT signing                      | ✓ Good  |
| KV for demand/status coordination | Lightweight, no database needed for two keys                              | ✓ Good  |
| On-demand streaming (not 24/7)    | Save bandwidth and compute on Pi; stream only when someone wants to watch | ✓ Good  |
| Bun for relay runtime             | Fast startup, good subprocess management, runs well on Pi                 | ✓ Good  |
| Counterscale for analytics        | Privacy-friendly, self-hosted on Workers, lightweight                     | ✓ Good  |
| USGS API for river data           | Free, reliable public data for Trask River gauge                          | ✓ Good  |
| Static fish run table             | Seasonal patterns are predictable; avoids complex data sourcing           | ✓ Good  |

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

_Last updated: 2026-04-13 after Phase 01 (v1.2 HLS playback reliability) complete_
