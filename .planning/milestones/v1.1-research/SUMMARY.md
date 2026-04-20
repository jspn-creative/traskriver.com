# Project Research Summary

**Project:** Trask River Cam
**Domain:** Live-streaming river cam with analytics and environmental data
**Researched:** 2026-04-10
**Confidence:** HIGH

## Executive Summary

The v1.1 milestone adds four capabilities to an existing SvelteKit + Cloudflare Workers live-streaming app: Counterscale analytics, USGS river data, sunrise/sunset times, and a sidebar/footer content overhaul targeting anglers.

Research confirms all features are straightforward. **Only one npm package is truly needed:** `@counterscale/tracker`. Sunrise/sunset can be added by extending the existing Open-Meteo weather API call (add `&daily=sunrise,sunset` parameter — no `suncalc` library needed). USGS data uses native `fetch`. Fish run status is static TypeScript data. No new infrastructure, API routes, or KV bindings required.

**Critical findings:**

1. **Counterscale does NOT support custom events** (Issue #200, still open). Engagement tracking requires synthetic pageviews with `/event/` prefixed paths. Scope v1.1 analytics to pageviews + this workaround.
2. **USGS gauge 14302480 confirmed live** for the Trask River — returns discharge (407 cfs), water temp (12.7°C), and gage height (6.66 ft). JSON format, CORS enabled, no API key.
3. **Counterscale npm README has wrong config key** — says `deploymentUrl` but source code uses `reporterUrl`. Using the wrong key silently fails.
4. **USGS will block IPs for over-polling** — must cache server-side or use careful client-side fetch-once patterns. Data updates hourly at most.

## Key Findings

### Stack Additions

**Required:**

- `@counterscale/tracker` (^3.4.1) — analytics tracking, already deployed at `counterscale.jspn.workers.dev`

**Not needed (research resolved):**

- `suncalc` — Open-Meteo already provides sunrise/sunset via URL parameter addition
- No USGS client library — native `fetch` to REST API is sufficient
- No date library — `Intl.DateTimeFormat` with `America/Los_Angeles` timezone

### Expected Features

**Table stakes (v1.1):**

- Visitor analytics (unique visitors, page views via Counterscale)
- River branding & description (replace product-page copy)
- Always-visible start button + weather (no more panel swap)
- River flow/discharge from USGS (THE data anglers check)
- Water temperature (affects fish behavior)
- Sunrise/sunset times (fishing best at dawn/dusk)
- Data freshness indicator ("Updated X min ago")
- Copy cleanup for angler audience

**Differentiators:**

- Gage height display (meaningful to experienced anglers)
- Seasonal fish run indicator (static monthly data)
- Flow condition labels ("Fishable" / "High" / "Blown out")

**Anti-features (exclude):**

- Real-time chat/comments — moderation burden
- Historical flow charts — USGS already does this, link to them
- Watch duration tracking — Counterscale can't do it properly
- Turbidity/dissolved oxygen — USGS sensors return no data for this gauge

### Architecture Approach

Client-side data fetching for USGS and Open-Meteo (matching existing `LocalWeather.svelte` pattern). Both APIs are public, CORS-enabled, no-auth. Counterscale loads via script tag for pageviews + npm module for engagement events. Self-contained components that own their own fetch/state (no new server routes).

**Major new components:**

1. `RiverConditions.svelte` — USGS flow/temp/gage, sunrise/sunset
2. `FishRunStatus.svelte` — static seasonal fish data
3. `SidebarHeader.svelte` — branding + compact weather summary
4. `$lib/data/fish-runs.ts` — static fish run lookup table
5. `$lib/analytics.ts` — Counterscale wrapper with typed event helpers

**Key modification:** `+page.svelte` sidebar changes from conditional `{#if phase === 'viewing'}` panel swap to always-visible stacked layout. `TelemetryFooter` replaced with `RiverConditions`.

### Critical Pitfalls

1. **Counterscale lacks custom events** — scope to pageviews + virtual pageview workaround; document limitation
2. **USGS API rate limiting** — fetch once per component mount, not on every state change; consider server-side caching if traffic grows
3. **+page.svelte refactor risk** — change sidebar content only, do NOT refactor the stream state machine simultaneously
4. **USGS response parsing** — match by parameter code (`00060`, `00010`), never by array index; handle partial/offline gauge data
5. **Counterscale wrong config key** — use `reporterUrl`, not `deploymentUrl` (npm README is wrong)

## Implications for Roadmap

### Phase 1: Analytics Integration

**Rationale:** Zero visual impact, validates tracking pipeline immediately
**Delivers:** Counterscale pageview tracking + engagement event framework
**Addresses:** Analytics feature scope
**Avoids:** Silent tracking failures by verifying against dashboard early

### Phase 2: Sidebar & Content Overhaul

**Rationale:** Biggest UX impact — current copy actively confuses users. Layout restructuring is the foundation for data components.
**Delivers:** New sidebar layout (always-visible weather + CTA), branding, copy cleanup, TelemetryFooter removal
**Addresses:** Sidebar overhaul, content cleanup
**Avoids:** State machine refactor risk by changing content only, not stream logic

### Phase 3: River Conditions & Environmental Data

**Rationale:** Data components slot into the new sidebar layout established in Phase 2
**Delivers:** USGS river data, sunrise/sunset, fish run status, data freshness indicators
**Addresses:** River conditions footer, environmental context for anglers
**Avoids:** USGS parsing pitfalls by building robust parser from start

### Phase Ordering Rationale

- Analytics first: decoupled, invisible to users, validates tracking
- Sidebar overhaul before data: establishes the layout container, fixes the most urgent UX issues (confusing copy)
- Data last: components drop into the established layout with real data

### Research Flags

- **Phase 1 (Analytics):** Watch for `reporterUrl` vs `deploymentUrl`, SPA navigation tracking edge cases
- **Phase 2 (Sidebar):** Test all stream phase transitions after layout changes; mobile drawer overflow
- **Phase 3 (Data):** USGS response parsing, gauge offline handling, USGS rate limit awareness

## Confidence Assessment

| Area         | Confidence | Notes                                                                                  |
| ------------ | ---------- | -------------------------------------------------------------------------------------- |
| Stack        | HIGH       | All packages verified via npm registry and live testing                                |
| Features     | HIGH       | USGS API confirmed with live data from exact Trask River gauge                         |
| Architecture | HIGH       | Standard SvelteKit patterns, existing codebase fully mapped                            |
| Pitfalls     | HIGH       | Counterscale limitation and USGS constraints verified from source code + official docs |

**Overall confidence:** HIGH

### Gaps to Address

- Counterscale SPA navigation tracking needs live testing (may need `afterNavigate` manual calls)
- Fish run timing needs validation against local ODFW Tillamook County guides
- USGS gauge downtime frequency unknown — design offline state, observe over time
- Optimal flow thresholds for "fishable" labels need local angler input

## Sources

### Primary (HIGH confidence)

- Counterscale GitHub + source code — v3.4.1 API verified
- USGS Water Services API — live response from gauge 14302480 verified
- Open-Meteo API — sunrise/sunset parameter verified for Tillamook coordinates
- Existing codebase — all 18 components and routes inspected

### Secondary (MEDIUM confidence)

- ODFW species pages — general coastal run timing (not Trask-specific)
- Counterscale virtual pageview pattern — community-documented, not officially supported

---

_Research completed: 2026-04-10_
_Ready for roadmap: yes_
