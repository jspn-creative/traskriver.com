# Roadmap: Trask River Cam v1.1

**Milestone:** v1.1 — Analytics & User-Ready Polish
**Created:** 2026-04-10
**Phases:** 3
**Requirements:** 11

## Phase Overview

| #   | Phase                      | Goal                                                                  | Requirements                                | Success Criteria |
| --- | -------------------------- | --------------------------------------------------------------------- | ------------------------------------------- | ---------------- |
| 1   | Analytics Integration      | Usage tracking is live and reporting                                  | ANLY-01, ANLY-02                            | 2 ✓ (2026-04-11) |
| 2   | Sidebar & Content Overhaul | Sidebar presents angler-relevant content with always-visible controls | SIDE-01, SIDE-02, SIDE-03, SIDE-04          | 4                |
| 3   | River Conditions Data      | Users can check river conditions alongside the live stream            | RIVR-01, RIVR-02, RIVR-03, RIVR-04, FOOT-01 | 5                |

## Phase Details

### Phase 1: Analytics Integration

**Goal:** Every page visit is tracked and visitor data appears in the Counterscale dashboard
**Depends on:** Nothing (decoupled from all UI work)
**Requirements:** ANLY-01, ANLY-02

**Success Criteria:**

1. Opening the site in a browser registers a pageview in the Counterscale dashboard
2. The Counterscale dashboard shows unique visitors, referrer sources, and device breakdowns for traskriver.com

**Key context:**

- Counterscale is already deployed at `counterscale.jspn.workers.dev` — only the tracker integration is needed
- Use `reporterUrl` config key, NOT `deploymentUrl` (npm README is wrong, source code uses `reporterUrl`)
- `@counterscale/tracker` (^3.4.1) is the only npm package to install
- Custom events are NOT supported by Counterscale (Issue #200) — engagement tracking deferred to ANLY-03 (v1.x)
- Test SPA navigation tracking — may need `afterNavigate` manual calls in SvelteKit
- This phase has zero visual impact — validates the tracking pipeline before any UI changes

**Plans:** 1/1 plans complete

Plans:

- [x] 01-01-PLAN.md — Install Counterscale tracker with production-gated init in root layout (completed 2026-04-11)

---

### Phase 2: Sidebar & Content Overhaul

**Goal:** The sidebar presents "Trask River Cam" branding and angler-relevant content with weather and stream controls always visible
**Depends on:** Phase 1
**Requirements:** SIDE-01, SIDE-02, SIDE-03, SIDE-04

**Success Criteria:**

1. The sidebar header shows "Trask River Cam" branding with a brief description of the river and its location
2. Local weather conditions are visible in the sidebar at all times — before, during, and after streaming
3. The start/restart stream button is visible in the sidebar at all times — no hunting through panels
4. All product-page filler copy (pricing, "24/7 Video Access", spec tables) is gone and replaced with content relevant to anglers checking the river

**Key context:**

- Current sidebar swaps content based on stream phase (`{#if phase === 'viewing'}`) — the overhaul changes this to an always-visible stacked layout
- **CRITICAL: Do NOT refactor the stream state machine in +page.svelte** — change sidebar content and layout only, leave stream logic untouched
- Test all stream phase transitions (idle → starting → viewing → timeout → restart) after layout changes
- Watch for mobile drawer overflow after adding always-visible weather + button
- This phase establishes the layout container that Phase 3's data components will slot into

**Plans:** 1 plan

Plans:

- [ ] 02-01-PLAN.md — Overhaul sidebar layout: branding, always-visible weather, sticky stream button, delete PassDetailsPanel

**UI hint:** yes

---

### Phase 3: River Conditions Data

**Goal:** Users can see current river conditions (flow, temperature, sunrise/sunset, fish runs) with clear freshness indicators
**Depends on:** Phase 2 (data components slot into the sidebar layout established in Phase 2)
**Requirements:** RIVR-01, RIVR-02, RIVR-03, RIVR-04, FOOT-01

**Success Criteria:**

1. User can see today's sunrise and sunset times for the Trask River location
2. User can see which fish species are currently in season on the Trask River
3. User can see current river flow (cfs) and water temperature sourced from USGS gauge data
4. Each piece of river data shows when it was last updated (e.g., "Updated 23 min ago")
5. The old telemetry footer (encoding/bitrate) is replaced with the river conditions data

**Key context:**

- USGS gauge 14302480 is confirmed live — returns discharge (cfs, param `00060`), water temp (param `00010`), and gage height
- Parse USGS response by parameter code, never by array index — handle partial/offline gauge data gracefully
- USGS rate limiting: fetch once per component mount, not on every state change — data updates hourly at most
- Sunrise/sunset: extend existing Open-Meteo weather API call with `&daily=sunrise,sunset` — no suncalc library needed
- Fish run status: static TypeScript lookup table (`$lib/data/fish-runs.ts`) based on ODFW seasonal data
- Match existing `LocalWeather.svelte` pattern: self-contained component that owns its own fetch/state
- No new server routes or KV bindings — all client-side fetch to public CORS APIs
- Expected new components: `RiverConditions.svelte`, `FishRunStatus.svelte`, `$lib/data/fish-runs.ts`

**Plans:** TBD
**UI hint:** yes

---

## Coverage

| Requirement | Phase   |
| ----------- | ------- |
| ANLY-01     | Phase 1 |
| ANLY-02     | Phase 1 |
| SIDE-01     | Phase 2 |
| SIDE-02     | Phase 2 |
| SIDE-03     | Phase 2 |
| SIDE-04     | Phase 2 |
| RIVR-01     | Phase 3 |
| RIVR-02     | Phase 3 |
| RIVR-03     | Phase 3 |
| RIVR-04     | Phase 3 |
| FOOT-01     | Phase 3 |

**Coverage:** 11/11 requirements mapped ✓

---

_Roadmap created: 2026-04-10_
