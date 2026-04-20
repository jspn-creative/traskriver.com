# Feature Research

**Domain:** River cam analytics and environmental data for anglers
**Researched:** 2026-04-10
**Confidence:** HIGH (verified against live APIs and source repos)

## Critical Finding: Counterscale Custom Events Don't Exist

**Counterscale does NOT support custom event tracking.** The tracker (`@counterscale/tracker` v3.4.1) only supports `trackPageview()`. Custom events are an open feature request ([Issue #200](https://github.com/benvinegar/counterscale/issues/200), opened Jul 2025, still open as of Apr 2026). The PROJECT.md lists "custom engagement events" as a v1.1 target — this needs to be scoped down to pageview-only analytics, or the custom events portion deferred until Counterscale adds support.

**What Counterscale CAN do for v1.1:**

- Unique visitor counts (automatic, cookie-free)
- Page view tracking (including manual `trackPageview()` calls)
- Referrer tracking (where visitors come from)
- Device/browser breakdown
- Country-level geo (no city/region yet)

**What it CANNOT do:**

- Custom events (stream start, stream timeout, watch duration, restart)
- Event-level engagement metrics
- Custom properties on pageviews

**Workaround option:** Encode engagement signals into synthetic "pageview" URLs (e.g., `trackPageview({ url: '/events/stream-start' })`). This appears in the Counterscale dashboard as page visits to virtual paths. It's a hack but would give basic event counting without real custom event support. LOW confidence this is officially supported — needs testing.

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature                             | Why Expected                                                                                                                                             | Complexity | Notes                                                                                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Visitor analytics**               | Need to know if anyone uses the site before sharing                                                                                                      | Low        | Counterscale pageview tracking — `npm i @counterscale/tracker`, init in `+layout.svelte`. Already deployed at `counterscale.jspn.workers.dev`                      |
| **River branding & description**    | Users land on a product page, not a river cam — need context for what they're looking at                                                                 | Low        | Replace PassDetailsPanel's "24/7 Video Access" / "$0 USD" pricing content with "Trask River Cam" branding and 2-3 line river description                           |
| **Always-visible start button**     | Current sidebar swaps between PassDetailsPanel and LocalWeather on stream start — the start button disappears once viewing                               | Low        | Restructure sidebar to keep CTA + weather visible in all phases                                                                                                    |
| **Current weather (already built)** | Anglers need to know conditions before driving out                                                                                                       | Done       | LocalWeather.svelte already fetches from Open-Meteo API                                                                                                            |
| **Sunrise / sunset times**          | Anglers plan trips around daylight — fishing is best at dawn/dusk, and OR has legal fishing hour requirements                                            | Low        | Open-Meteo already provides `daily=sunrise,sunset` — add parameter to existing weather fetch in LocalWeather.svelte. No new dependency needed (NOT suncalc)        |
| **River flow (discharge)**          | THE #1 data point anglers check — determines if river is fishable, too high, or blown out                                                                | Low        | USGS station 14302480 returns live discharge (cfs) via `waterservices.usgs.gov/nwis/iv/?sites=14302480&parameterCd=00060&format=json` — verified returning 407 cfs |
| **Water temperature**               | Affects fish activity and species targeting — steelhead bite best at specific temps                                                                      | Low        | Same USGS station returns water temp (°C) via parameterCd=00010 — verified returning 12.6°C. Convert to °F for display                                             |
| **Data freshness indicator**        | Users need to know if river data is current or stale                                                                                                     | Low        | Display "Updated X min ago" from USGS response timestamp                                                                                                           |
| **Copy cleanup**                    | Current copy reads like a parody product page ("Limited Quantity Available", "$0 USD", "Ad Interruptions: Only occasionally") — confusing for real users | Low        | Rewrite PassDetailsPanel content for angler audience                                                                                                               |

### Differentiators (Competitive Advantage)

| Feature                                         | Value Proposition                                                                                                            | Complexity | Notes                                                                                                                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Gage height display**                         | Experienced anglers know their preferred water levels — "6.66 ft" means something to locals who know wade-ability thresholds | Low        | USGS station 14302480 also returns gage height (ft) via parameterCd=00065. Verified live. Bundle with discharge fetch                                                    |
| **Seasonal fish run indicator**                 | Tells anglers WHAT species are running NOW — saves them research                                                             | Low        | Static data table based on ODFW patterns. Show current month's active runs with simple status indicator                                                                  |
| **Flow condition label**                        | Translate raw cfs number into angler-friendly language ("Low", "Fishable", "High", "Blown out")                              | Low        | Map discharge ranges to labels. Approximate ranges for Trask: <150 cfs = Low, 150–600 cfs = Fishable, 600–1500 cfs = High, >1500 cfs = Blown out. Needs local validation |
| **Stale data warnings**                         | Proactively warn when USGS gauge is offline (storm damage, equipment failure)                                                | Low        | Compare USGS response dateTime to current time; warn if >2 hours old                                                                                                     |
| **Engagement tracking via synthetic pageviews** | Know how the stream feature is actually used (starts, timeouts, watch patterns)                                              | Medium     | Synthetic pageview URLs like `/events/stream-start`, `/events/stream-timeout` — workaround for missing custom events. Adds complexity but gives basic metrics            |
| **USGS data deep link**                         | Let power users dig deeper — links to full USGS monitoring page with historical charts                                       | Trivial    | Link to `waterdata.usgs.gov/monitoring-location/14302480/`                                                                                                               |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature                                  | Why Requested                           | Why Problematic                                                                                                                                                                                       | Alternative                                                                     |
| ---------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Real-time chat / comments**            | "Let anglers share what they see"       | Moderation nightmare for a one-person project. Spam, liability, no audience yet                                                                                                                       | Link to existing angler community forums                                        |
| **Fish run data from live API**          | "Pull real ODFW data automatically"     | ODFW doesn't have a public API for run status. Their recreation reports are HTML pages with irregular update schedules. Scraping is fragile and legally gray                                          | Static seasonal table updated manually 2x/year based on ODFW published patterns |
| **Historical flow charts / graphs**      | "Show me the trend over the last week"  | Scope creep — requires caching USGS data, charting library, responsive charts. The USGS site already does this well                                                                                   | Show current reading + link to USGS for historical data                         |
| **Turbidity / dissolved oxygen display** | "More water quality data"               | USGS station 14302480 has parameters for turbidity (63680) and dissolved oxygen (00300) but they currently return NO data (verified). Showing empty data = broken UX                                  | Omit from v1.1. Add later only if USGS activates these sensors                  |
| **Detailed weather forecast**            | "Show me the 5-day forecast"            | Scope creep. Anglers already have weather apps. Adding forecast turns the cam into a weather app                                                                                                      | Current conditions only. Link to weather.gov for forecast                       |
| **Watch duration tracking**              | "How long do people watch the stream?"  | Requires periodic heartbeat events — Counterscale can't do custom events, and synthetic pageviews for duration would spam the analytics with repeated calls                                           | Defer until Counterscale adds custom event support                              |
| **Push notifications**                   | "Notify me when conditions are good"    | Requires service worker, notification permissions UX, background checking logic, and defining "good conditions" — massive scope for v1.1                                                              | Defer to v2+ if demand exists                                                   |
| **USGS data caching in KV**              | "Cache to avoid rate limits"            | Over-engineering — USGS data updates every 15 min, HTTP cache headers handle this fine for a single-page app with small audience. KV write limits on free tier are already a concern for relay status | Use server-side fetch with `Cache-Control` headers or SvelteKit load caching    |
| **Multiple gauge support**               | "Show data from other Tillamook rivers" | Only one camera, one river, one gauge. Complexity without matching user value                                                                                                                         | Hardcode gauge 14302480                                                         |
| **Custom analytics dashboard**           | "Build our own analytics UI"            | Counterscale already ships a dashboard at counterscale.jspn.workers.dev                                                                                                                               | Use existing Counterscale dashboard as-is                                       |

## Feature Dependencies

```
Counterscale analytics → +layout.svelte (init tracker on page load)
  ↳ Engagement tracking via synthetic pageviews → stream phase state changes in +page.svelte

Sidebar overhaul → PassDetailsPanel.svelte content rewrite
  ↳ Always-visible weather → restructure +page.svelte sidebar conditional rendering
     (currently: {#if phase === 'viewing'} → LocalWeather, {:else} → PassDetailsPanel)
  ↳ Always-visible start button → move CTA out of PassDetailsPanel into persistent sidebar section
  ↳ Copy cleanup → happens as part of sidebar content rewrite (same component)

River conditions footer → new component (e.g., RiverConditions.svelte)
  ↳ USGS data fetch → server-side fetch in +page.server.ts or client-side fetch
  ↳ Data freshness indicator → uses timestamp from USGS response
  ↳ Stale data warnings → compare USGS timestamp to Date.now()

Sunrise/sunset → extend existing Open-Meteo call in LocalWeather.svelte
  ↳ No new dependencies, just add URL parameter to existing fetch

Fish run indicator → static data, no external dependency
  ↳ New component or section within RiverConditions
```

## MVP Definition

### Launch With (v1.1)

1. **Counterscale pageview tracking** — `@counterscale/tracker` init in layout, `autoTrackPageviews: true`. Immediate value: know if anyone visits.
2. **Sidebar content overhaul** — Replace pricing/product content with river cam branding, 2-line description, always-visible weather summary + start button. Remove conditional swap between PassDetailsPanel and LocalWeather.
3. **Sunrise/sunset in weather** — Add `daily=sunrise,sunset` to existing Open-Meteo API call. Display in LocalWeather.svelte.
4. **USGS live river data** — Fetch discharge (cfs), water temperature (°F), and gage height (ft) from USGS station 14302480. Display in new river conditions footer component.
5. **Data freshness indicator** — "Updated X min ago" from USGS timestamp.
6. **Seasonal fish run indicator** — Static table showing active species for current month.
7. **Copy cleanup** — Remove all product-page / pricing language, rewrite for anglers.

### Add After Validation (v1.x)

8. **Engagement tracking via synthetic pageviews** — Encode stream-start, stream-timeout, stream-ended as virtual pageview paths in Counterscale. Only add once basic analytics is running and validated.
9. **Flow condition labels** — Translate cfs to "Low / Fishable / High / Blown out". Needs input from local anglers to calibrate thresholds.
10. **Stale data warnings** — USGS gauge offline indicator.
11. **PWA manifest** — Allow home screen install on mobile. Low effort, nice polish.

### Future Consideration (v2+)

12. **Real custom events** — When Counterscale ships Issue #200 (custom event tracking), migrate synthetic pageview workarounds to proper events.
13. **Historical flow mini-chart** — Small sparkline showing 24h flow trend. Requires USGS data caching.
14. **Turbidity display** — If/when USGS activates turbidity sensor at station 14302480.
15. **Push notifications for conditions** — "River is fishable" alerts. Major scope increase.

## Feature Prioritization Matrix

| Feature                                   | User Value                                          | Implementation Cost                                  | Priority                        |
| ----------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ------------------------------- |
| Copy cleanup                              | High — current copy actively confuses users         | Low — content rewrite only                           | P0 — Ship first                 |
| Sidebar overhaul (branding + layout)      | High — first impression, usability                  | Medium — restructure component hierarchy             | P0 — Ship first                 |
| Counterscale pageview analytics           | High — can't improve what you can't measure         | Low — npm install + 5 lines of init code             | P0 — Ship first                 |
| Sunrise/sunset                            | Medium — useful context, trivial to add             | Trivial — one URL param addition                     | P0 — Ship with weather          |
| USGS river flow + temp                    | High — THE data anglers want most                   | Low — single API call, display component             | P1 — Ship together              |
| Gage height                               | Medium — meaningful to experienced anglers          | Trivial — same API call as flow                      | P1 — Bundle with flow           |
| Data freshness indicator                  | Medium — trust signal for live data                 | Trivial — parse timestamp                            | P1 — Bundle with flow           |
| Fish run indicator                        | Medium — seasonal value, saves research             | Low — static data table                              | P1 — Ship together              |
| Flow condition label                      | Medium — makes flow data accessible to casual users | Low — simple cfs range mapping                       | P2 — After flow data validated  |
| Engagement tracking (synthetic pageviews) | Medium — useful for operator, invisible to users    | Medium — integration points across phase transitions | P2 — After basic analytics runs |
| USGS deep link                            | Low — power user feature                            | Trivial — one link                                   | P1 — Ship with flow data        |

## Data Sources Verified

### USGS Instantaneous Values API

- **Station:** 14302480 — TRASK RIVER ABOVE CEDAR CREEK, NEAR TILLAMOOK, OR
- **Coordinates:** 45.4462, -123.7104
- **Confirmed live parameters:** Discharge (00060), Water Temp (00010), Gage Height (00065)
- **Confirmed empty parameters:** Specific conductance (00095), Dissolved oxygen (00300), Turbidity (63680) — do NOT display these
- **API URL:** `https://waterservices.usgs.gov/nwis/iv/?sites=14302480&parameterCd=00060,00010,00065&format=json`
- **Response:** JSON with CORS support. 15-minute intervals. Data marked provisional ("P" qualifier).
- **Rate limits:** No formal rate limit documented, but USGS requests efficient queries and may block excessive use (HTTP 403). Use appropriate caching.

### Open-Meteo (existing)

- **Already used for:** Current weather (temp, humidity, wind, precipitation, weather code)
- **Current URL in code:** `api.open-meteo.com/v1/forecast?latitude=45.4562&longitude=-123.844&current=temperature_2m,...`
- **Add for v1.1:** `&daily=sunrise,sunset` parameter to existing fetch URL
- **Verified response:** Returns ISO 8601 times (e.g., `"2026-04-10T06:38"`, `"2026-04-10T19:55"`)

### Counterscale Tracker

- **Package:** `@counterscale/tracker` v3.4.1
- **Server:** Already deployed at `https://counterscale.jspn.workers.dev/`
- **Integration:** `Counterscale.init({ siteId: "traskriver", reporterUrl: "https://counterscale.jspn.workers.dev/collect" })`
- **API surface:** `init()`, `trackPageview()`, `isInitialized()`, `cleanup()`
- **Limitations:** Pageviews only. No custom events (Issue #200, still open).

### Fish Run Data (static)

- **Source:** ODFW species pages + general knowledge of Tillamook basin coastal fish runs
- **Trask River species by month (approximate):**

| Month | Active Species                                      |
| ----- | --------------------------------------------------- |
| Jan   | Winter Steelhead                                    |
| Feb   | Winter Steelhead                                    |
| Mar   | Winter Steelhead                                    |
| Apr   | Winter Steelhead (late), Spring Chinook (early)     |
| May   | Spring Chinook                                      |
| Jun   | Spring Chinook (late), Summer Steelhead (early)     |
| Jul   | Summer Steelhead                                    |
| Aug   | Summer Steelhead                                    |
| Sep   | Summer Steelhead (late), Fall Chinook (early)       |
| Oct   | Fall Chinook, Coho                                  |
| Nov   | Fall Chinook (late), Coho, Winter Steelhead (early) |
| Dec   | Coho (late), Winter Steelhead                       |

- **Confidence:** MEDIUM — based on ODFW general coastal run timing. Exact Trask River timing may vary year to year. Good enough for a "what's likely running" indicator. Should be validated with local anglers.

## Sources

- Counterscale GitHub repo: https://github.com/benvinegar/counterscale (README, Issue #200)
- Counterscale tracker npm: https://www.npmjs.com/package/@counterscale/tracker (v3.4.1 API docs)
- Counterscale website: https://counterscale.dev (features, setup flow)
- USGS Instantaneous Values API docs: https://waterservices.usgs.gov/docs/instantaneous-values/instantaneous-values-details/
- USGS Station 14302480 live data: verified via `waterservices.usgs.gov/nwis/iv/?sites=14302480&format=json&period=PT1H`
- USGS Monitoring Location page: https://waterdata.usgs.gov/monitoring-location/14302480/
- Open-Meteo API: verified via `api.open-meteo.com/v1/forecast?latitude=45.4562&longitude=-123.844&daily=sunrise,sunset&timezone=America/Los_Angeles&forecast_days=1`
- ODFW Steelhead page: https://myodfw.com/fishing/species/steelhead
- ODFW Chinook Salmon page: https://myodfw.com/fishing/species/chinook-salmon
- Existing codebase: LocalWeather.svelte, PassDetailsPanel.svelte, TelemetryFooter.svelte, +page.svelte (all reviewed)

---

_Feature research for: Trask River Cam v1.1_
_Researched: 2026-04-10_
