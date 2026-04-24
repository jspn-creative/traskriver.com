# Phase 8: Web Swap + Full Cleanup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 08-web-swap-full-cleanup
**Areas discussed:** VideoPlayer rewrite, Page state machine, Deletion scope & KV, PostHog events

**Roadmap change:** Original Phase 8 (VPS + DNS + Camera Infrastructure) was deferred to v1.3 at user request. Original Phase 9 (Web Swap + Full Cleanup) was promoted to Phase 8 as the final v1.2 phase. Stream service is already running on VPS.

---

## VideoPlayer rewrite

| Option                            | Description                                                                                                | Selected |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| Remove probing, mount immediately | Pass HLS URL directly to vidstack/HLS.js and let the player handle retries internally. No pre-mount fetch. | ✓        |
| Keep a lightweight probe          | Fetch .m3u8 once before mounting to confirm it exists. Delays mount by ~200ms.                             |          |

**User's choice:** Remove probing, mount immediately
**Notes:** None

| Option                      | Description                                                                                                      | Selected |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| HLS.js MEDIA_SEQUENCE stall | Watch EXT-X-MEDIA-SEQUENCE from hls.js LEVEL_LOADED events. If sequence hasn't advanced in ~30s, enter degraded. | ✓        |
| Segment fetch failures      | Use hls.js error events (FRAG_LOAD_ERROR, MANIFEST_LOAD_ERROR) to detect when stream stops.                      |          |

**User's choice:** HLS.js MEDIA_SEQUENCE stall
**Notes:** None

---

## Page state machine

| Option                    | Description                                                                             | Selected |
| ------------------------- | --------------------------------------------------------------------------------------- | -------- |
| Auto-play immediately     | Page loads → VideoPlayer mounts → HLS.js buffers → plays. No user interaction required. | ✓        |
| Show poster + play button | Show static poster image. User clicks play to start.                                    |          |

**User's choice:** Auto-play immediately
**Notes:** None

| Option                      | Description                                                                                 | Selected |
| --------------------------- | ------------------------------------------------------------------------------------------- | -------- |
| Overlay on frozen frame     | Semi-transparent overlay on last frame: "Camera offline — retrying..." with subtle spinner. | ✓        |
| Replace player with message | Hide video element, show full-width "Camera offline" card.                                  |          |

**User's choice:** Overlay on frozen frame
**Notes:** None

| Option                       | Description                                                          | Selected |
| ---------------------------- | -------------------------------------------------------------------- | -------- |
| Simple error card with retry | "Stream unavailable" message with "Try again" button. No auto-retry. | ✓        |
| Auto-retry with backoff      | Keep retrying with increasing intervals. Show attempt counter.       |          |

**User's choice:** Simple error card with retry
**Notes:** None

---

## Deletion scope & KV

| Option         | Description                           | Selected |
| -------------- | ------------------------------------- | -------- |
| Delete test-kv | Dev scaffolding, no remaining purpose | ✓        |
| Keep test-kv   | Still use it for something            |          |

**User's choice:** Delete test-kv
**Notes:** None

| Option                                        | Description                                 | Selected |
| --------------------------------------------- | ------------------------------------------- | -------- |
| Delete both LiveViewerCount + TelemetryFooter | Neither imported, both dead code candidates |          |
| Delete LiveViewerCount, keep TelemetryFooter  | TelemetryFooter might be useful later       | ✓        |
| Keep both                                     | May re-enable them                          |          |

**User's choice:** Delete LiveViewerCount, keep TelemetryFooter
**Notes:** None

| Option                       | Description                        | Selected |
| ---------------------------- | ---------------------------------- | -------- |
| Delete server PostHog helper | No remaining server-side consumers | ✓        |
| Keep server PostHog helper   | Might add server-side events later |          |

**User's choice:** Delete server PostHog helper
**Notes:** None

| Option                   | Description                                                                | Selected |
| ------------------------ | -------------------------------------------------------------------------- | -------- |
| Remove RIVER_KV entirely | No consumers left. Remove binding, RELAY_API_TOKEN, DEMAND_WINDOW_SECONDS. | ✓        |
| Keep KV binding          | Keep configured for v1.3                                                   |          |

**User's choice:** Remove RIVER_KV entirely
**Notes:** None

---

## PostHog events

| Option                             | Description                                                               | Selected |
| ---------------------------------- | ------------------------------------------------------------------------- | -------- |
| Minimal: page_viewed + errors only | stream_viewed on load, stream_error on error, stream_degraded on degraded |          |
| Keep buffering + timing events     | Also track buffering, time_to_first_frame, stream_recovered               | ✓        |
| Strip all PostHog events           | Remove all, rely on auto-capture                                          |          |

**User's choice:** Keep buffering + timing events
**Notes:** Includes stream_viewed, stream_error, stream_degraded, stream_recovered, playback_buffering_started, time_to_first_frame

---

## the agent's Discretion

- Exact HLS.js configuration, MEDIA_SEQUENCE stall threshold, PostHog event property schemas
- Connecting state UI, internal file organization, overlay extraction decisions

## Deferred Ideas

- VPS infra hardening (systemd, TLS, OLS, camera docs) — v1.3
- HLS cache-header rewriting — v1.3
- TelemetryFooter re-integration — kept but not imported
