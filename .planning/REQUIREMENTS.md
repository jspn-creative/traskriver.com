# Requirements: Trask River Cam

**Defined:** 2026-04-10
**Core Value:** Users can see the Trask River live, on-demand, from anywhere

## v1.1 Requirements

Requirements for milestone v1.1: Analytics & User-Ready Polish. Each maps to roadmap phases.

### Analytics

- [ ] **ANLY-01**: Counterscale tracker is loaded on every page visit and records unique visitors
- [ ] **ANLY-02**: Pageview data (visitors, referrers, devices) appears in Counterscale dashboard

### Sidebar

- [ ] **SIDE-01**: Sidebar header displays "Trask River Cam" branding with a brief description of the river
- [ ] **SIDE-02**: Local weather conditions are always visible in the sidebar regardless of stream state
- [ ] **SIDE-03**: Start/restart stream button is always visible in the sidebar regardless of stream state
- [ ] **SIDE-04**: Product-page copy (pricing, "24/7 Video Access", spec tables, filler content) is removed and replaced with angler-relevant content

### River Data

- [ ] **RIVR-01**: User can see sunrise and sunset times for the Trask River location
- [ ] **RIVR-02**: User can see which fish species are currently in season on the Trask River
- [ ] **RIVR-03**: User can see current river flow (cfs) and water temperature from USGS gauge data
- [ ] **RIVR-04**: River data displays a freshness indicator showing when data was last updated

### Footer

- [ ] **FOOT-01**: Telemetry footer (encoding/bitrate) is replaced with river conditions data

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

| Requirement | Phase   | Status  |
| ----------- | ------- | ------- |
| ANLY-01     | Phase 1 | Pending |
| ANLY-02     | Phase 1 | Pending |
| SIDE-01     | Phase 2 | Pending |
| SIDE-02     | Phase 2 | Pending |
| SIDE-03     | Phase 2 | Pending |
| SIDE-04     | Phase 2 | Pending |
| RIVR-01     | Phase 3 | Pending |
| RIVR-02     | Phase 3 | Pending |
| RIVR-03     | Phase 3 | Pending |
| RIVR-04     | Phase 3 | Pending |
| FOOT-01     | Phase 3 | Pending |

**Coverage:**

- v1.1 requirements: 11 total
- Mapped to phases: 11 ✓
- Unmapped: 0

---

_Requirements defined: 2026-04-10_
_Last updated: 2026-04-10 after roadmap creation_
