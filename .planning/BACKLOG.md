# Backlog

Deferred from v1.1 (River Conditions Data)

## Phase 3: River Conditions Data

**Goal:** Users can see current river conditions (flow, temperature, sunrise/sunset, fish runs) with clear freshness indicators

**Depends on:** Phase 2 (sidebar established)

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

**UI hint:** yes

---

_Backlog updated: 2026-04-20_
