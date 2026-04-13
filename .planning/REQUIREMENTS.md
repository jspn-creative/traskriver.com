# Requirements: Trask River Cam

**Defined:** 2026-04-10
**Core Value:** Users can see the Trask River live, on-demand, from anywhere

## v1.1 Requirements

Requirements for milestone v1.1: Analytics & User-Ready Polish. Each maps to roadmap phases.

### Analytics

- [x] **ANLY-01**: Counterscale tracker is loaded on every page visit and records unique visitors
- [x] **ANLY-02**: Pageview data (visitors, referrers, devices) appears in Counterscale dashboard

### Sidebar

- [x] **SIDE-01**: Sidebar header displays "Trask River Cam" branding with a brief description of the river
- [x] **SIDE-02**: Local weather conditions are always visible in the sidebar regardless of stream state
- [x] **SIDE-03**: Start/restart stream button is always visible in the sidebar regardless of stream state
- [x] **SIDE-04**: Product-page copy (pricing, "24/7 Video Access", spec tables, filler content) is removed and replaced with angler-relevant content

### River Data

- [x] **RIVR-01**: User can see sunrise and sunset times for the Trask River location
- [x] **RIVR-02**: User can see which fish species are currently in season on the Trask River
- [x] **RIVR-03**: User can see current river flow (cfs) and water temperature from USGS gauge data
- [x] **RIVR-04**: River data displays a freshness indicator showing when data was last updated

### Footer

- [x] **FOOT-01**: Telemetry footer (encoding/bitrate) is replaced with river conditions data

## v1.2 Requirements

Requirements for milestone v1.2: Stream Reliability & Error Handling. Identified via debug session analyzing production console logs.

### Stream Playback

- [x] **STRM-01**: VideoPlayer does not use destructive remount as its primary retry mechanism — HLS.js's built-in recovery is used for transient errors
- [x] **STRM-02**: Empty HLS manifests during Cloudflare Stream warmup (levelEmptyError) are handled as an expected startup condition, not as errors that trigger retries
- [x] **STRM-03**: JWT signed URL TTL is long enough that tokens cannot expire during normal stream startup (minimum 1 hour)
- [x] **STRM-04**: VideoPlayer console logging is reduced to meaningful state transitions only — no per-error spam for expected transient conditions
- [x] **STRM-05**: Page state machine does not enter `ended_confirming` phase due to transient HLS startup errors

### Analytics

- [x] **CORS-01**: Counterscale analytics tracker requests from traskriver.com are not blocked by CORS policy

## Future Requirements

Deferred to v1.x. Tracked but not in current roadmap.

### Analytics

- **ANLY-03**: Engagement events tracked via synthetic pageviews (stream start, timeout, restart)

### River Data

- **RIVR-05**: Gage height display alongside flow and temperature
- **RIVR-06**: Flow condition labels translating cfs to angler-friendly terms ("Low" / "Fishable" / "High" / "Blown out")
- **RIVR-07**: Stale data warnings when USGS gauge is offline (>2 hours old)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature                            | Reason                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| Custom analytics events (native)   | Counterscale doesn't support them (Issue #200, open since Jul 2025)           |
| Watch duration tracking            | Requires custom events Counterscale can't do                                  |
| Historical flow charts/graphs      | USGS already does this well — link to USGS monitoring page                    |
| Real-time chat/comments            | Moderation burden for a one-person project, no audience yet                   |
| Server-side USGS caching in KV     | Over-engineering for expected traffic; simple client-side fetch is sufficient |
| Turbidity/dissolved oxygen display | USGS sensors at gauge 14302480 return no data for these parameters            |
| Detailed weather forecast          | Scope creep — anglers already have weather apps                               |
| Push notifications for conditions  | Major scope increase, no demonstrated demand                                  |
| Multiple gauge/camera support      | Single camera, single river, single gauge for now                             |
| PWA manifest / home screen install | Nice-to-have polish, defer to v1.x                                            |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase   | Status   |
| ----------- | ------- | -------- |
| ANLY-01     | Phase 1 | Complete |
| ANLY-02     | Phase 1 | Complete |
| SIDE-01     | Phase 2 | Complete |
| SIDE-02     | Phase 2 | Complete |
| SIDE-03     | Phase 2 | Complete |
| SIDE-04     | Phase 2 | Complete |
| RIVR-01     | Phase 3 | Complete |
| RIVR-02     | Phase 3 | Complete |
| RIVR-03     | Phase 3 | Complete |
| RIVR-04     | Phase 3 | Complete |
| FOOT-01     | Phase 3 | Complete |
| STRM-01     | Phase 1 | Complete |
| STRM-02     | Phase 1 | Complete |
| STRM-03     | Phase 1 | Complete |
| STRM-04     | Phase 1 | Complete |
| STRM-05     | Phase 1 | Complete |

**Coverage:**

- v1.1 requirements: 11 total
- Mapped to phases: 11 ✓
- Unmapped: 0

---

_Requirements defined: 2026-04-10_
_Last updated: 2026-04-13 after Phase 01 (v1.2 HLS reliability) — STRM-01..05_
