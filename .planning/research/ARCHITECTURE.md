# Architecture Research

**Domain:** River cam with analytics and environmental data integration
**Researched:** 2026-04-10
**Confidence:** HIGH

## Integration Overview

The v1.1 milestone adds four capabilities to an existing single-page SvelteKit app deployed on Cloudflare Workers:

1. **Counterscale analytics** — client-side script + custom engagement events
2. **USGS river data** — flow rate, gage height, water temperature from gauge 14302480
3. **Sunrise/sunset** — daylight times from Open-Meteo (already used for weather)
4. **Sidebar/footer content overhaul** — restructured sidebar layout, replaced TelemetryFooter with river conditions

The existing architecture is well-suited for these additions. No new API routes, databases, or infrastructure are needed. The core change pattern is: new leaf components + modifications to `+layout.svelte` (analytics) and `+page.svelte` (sidebar composition).

### Architecture Principle: Client-Side Data Fetching

The existing app fetches weather data client-side from Open-Meteo in `LocalWeather.svelte`. USGS and sunrise/sunset data should follow the same pattern because:

- **No secrets required** — USGS API and Open-Meteo are public, no-auth APIs with CORS support
- **No server-side overhead** — Cloudflare Workers have CPU time limits; offloading public API calls to the client avoids consuming Workers CPU on pass-through proxying
- **Existing pattern** — matches `LocalWeather.svelte`'s `$effect(() => fetch())` approach
- **No SSR benefit** — this is a single-page live stream app. There's no SEO value in SSR-rendering river flow data. The app has no `+page.server.ts` or load functions today; adding one just to proxy public APIs would be unnecessary complexity.

The one exception: if USGS ever requires API keys or CORS breaks, add a thin proxy route (`/api/river/conditions`). But this is not the case today — USGS explicitly supports CORS (confirmed in their docs and verified with a live fetch).

## Component Changes

### New Components

| Component                | Responsibility                                                                                                                                                           | Location                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `RiverConditions.svelte` | Fetches and displays USGS flow/gage height/water temp + sunrise/sunset. Self-contained data fetcher like `LocalWeather.svelte`. Renders as a footer-like bar or section. | `$lib/components/RiverConditions.svelte` |
| `FishRunStatus.svelte`   | Displays current seasonal fish run status. Reads static lookup table (month to species/status). Pure display, no API calls.                                              | `$lib/components/FishRunStatus.svelte`   |
| `SidebarHeader.svelte`   | Branding block with site name, description, and always-visible weather summary. Extracted from inline markup to keep `+page.svelte` manageable.                          | `$lib/components/SidebarHeader.svelte`   |
| `$lib/data/fish-runs.ts` | Static TypeScript constant with Trask River fish species, peak months, presence months.                                                                                  | `$lib/data/fish-runs.ts`                 |
| `$lib/analytics.ts`      | Thin wrapper around `@counterscale/tracker` with typed event helpers and init guard.                                                                                     | `$lib/analytics.ts`                      |

### Modified Components

| Component                 | Current                                                                                                                     | Changes Needed                                                                                                                                                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `+layout.svelte`          | Imports CSS, sets favicon/title. 13 lines.                                                                                  | Add Counterscale `<script>` tag in `<svelte:head>`. Add `<meta>` description for SEO. ~5 lines added.                                                                                                                                                                                                                   |
| `+page.svelte`            | 479 lines. Sidebar shows `PassDetailsPanel` (idle) or `LocalWeather` (viewing). `TelemetryFooter` always visible at bottom. | Restructure sidebar composition: always show `SidebarHeader` (weather + CTA), show `RiverConditions` + `FishRunStatus` below. Remove conditional swap between `PassDetailsPanel` and `LocalWeather`. Replace `TelemetryFooter` with `RiverConditions`. Add Counterscale engagement tracking calls at phase transitions. |
| `PassDetailsPanel.svelte` | Full product-page-style layout with specs table, pricing joke, CTA button. 147 lines.                                       | Simplify to focused CTA section. Remove spec table and pricing display. Keep start-stream button + status messaging. Becomes a sub-section within the new sidebar layout rather than the entire sidebar.                                                                                                                |
| `TelemetryFooter.svelte`  | Static display: "Encoding: H.264" and "Max Bitrate: 4.096 Mbps". 10 lines.                                                  | **Replace entirely** with `RiverConditions.svelte`. The telemetry info was placeholder content; river conditions are the actual value for anglers.                                                                                                                                                                      |
| `LocalWeather.svelte`     | Self-contained Open-Meteo fetcher. Only shown during `viewing` phase. 116 lines.                                            | Add `&daily=sunrise,sunset&forecast_days=1` to the existing Open-Meteo fetch URL. Parse `response.daily.sunrise[0]` and `response.daily.sunset[0]`. Make weather data always visible in sidebar (not phase-gated — this is a `+page.svelte` composition change, not a `LocalWeather` change).                           |

### Unchanged Components

| Component                            | Why Unchanged                                                |
| ------------------------------------ | ------------------------------------------------------------ |
| `VideoPlayer.svelte`                 | Video pipeline is orthogonal to sidebar/analytics changes    |
| `stream.remote.ts`                   | JWT signing for Cloudflare Stream — no touch needed          |
| `/api/stream/demand/+server.ts`      | Demand registration is unchanged                             |
| `/api/relay/status/+server.ts`       | Relay polling is unchanged                                   |
| `LiveViewerCount.svelte`             | Viewer count display unchanged (currently unused but exists) |
| Drawer UI primitives (`vaul-svelte`) | Layout container works as-is; content inside changes         |
| `app.d.ts`                           | No new server-side bindings needed                           |

## Data Flow

### Analytics Flow (Counterscale)

```
Browser loads page
  +layout.svelte <svelte:head> loads tracker.js from counterscale.jspn.workers.dev
  Counterscale auto-tracks pageview (no cookies, no fingerprinting)

  +page.svelte imports $lib/analytics.ts for engagement events:
    - phase 'starting'  -> trackEvent('stream-started')
    - phase 'viewing'   -> trackEvent('stream-viewing')
    - phase 'ended'     -> trackEvent('stream-ended')

  Events sent as virtual pageviews: /event/stream-started, etc.
  Dashboard at counterscale.jspn.workers.dev/dashboard
```

**Integration approach:** Two layers working together:

1. **Script tag** in `+layout.svelte` `<svelte:head>` — handles automatic pageview tracking. This is sufficient because the app is a single-page app (no SvelteKit navigation between routes), so the initial pageview is the only navigation event.

2. **npm `@counterscale/tracker` package** — imported in `$lib/analytics.ts` wrapper module. Used for programmatic engagement event tracking via `trackPageview()` with synthetic URLs. Initialized with `autoTrackPageviews: false` to avoid double-counting with the script tag.

**Script placement:** `+layout.svelte` is the root layout. `<svelte:head>` ensures the script reaches the document `<head>`.

```svelte
<!-- +layout.svelte addition -->
<svelte:head>
	<script
		id="counterscale-script"
		data-site-id="traskriver"
		src="https://counterscale.jspn.workers.dev/tracker.js"
		defer
	></script>
	<meta
		name="description"
		content="Live river cam on the Trask River in Tillamook, Oregon. Check river conditions, flow data, and fish run status before your trip."
	/>
</svelte:head>
```

**Analytics wrapper module:**

```typescript
// $lib/analytics.ts
import * as Counterscale from '@counterscale/tracker';

const EVENTS = ['stream-started', 'stream-viewing', 'stream-ended'] as const;
type EngagementEvent = (typeof EVENTS)[number];

let initialized = false;

export function initAnalytics() {
	if (initialized || typeof window === 'undefined') return;
	Counterscale.init({
		siteId: 'traskriver',
		reporterUrl: 'https://counterscale.jspn.workers.dev/collect',
		autoTrackPageviews: false // script tag handles pageviews
	});
	initialized = true;
}

export function trackEvent(name: EngagementEvent) {
	if (!initialized) initAnalytics();
	Counterscale.trackPageview({ url: `/event/${name}` });
}
```

**Note:** Counterscale tracks "pageviews" not arbitrary events. Custom engagement is tracked as virtual pageviews with synthetic URLs. This is the standard Counterscale pattern.

### USGS Data Flow

```
RiverConditions.svelte mounts
  $effect() fires client-side fetch to USGS Instantaneous Values API
  URL: https://waterservices.usgs.gov/nwis/iv/
      ?sites=14302480
      &parameterCd=00060,00010,00065
      &format=json
      &period=PT2H
  Parse JSON response, extract latest values:
      - 00060: Discharge (ft^3/s) — e.g., "407 cfs"
      - 00010: Water temperature (C) — convert to F for display
      - 00065: Gage height (ft) — e.g., "6.66 ft"
  Display in compact footer-like layout
  No polling interval needed — anglers check once, not continuously
```

**Verified working:** USGS site 14302480 ("TRASK RIVER ABOVE CEDAR CREEK, NEAR TILLAMOOK, OR") returns all three parameters. CORS is supported. JSON format available. Response confirmed returning current data (407 cfs, 12.7C, 6.66 ft as of research time).

**Key data extraction path from USGS JSON:**

```
response.value.timeSeries[n].values[0].value[last].value  // the reading
response.value.timeSeries[n].variable.variableCode[0].value  // parameter code
response.value.timeSeries[n].sourceInfo.siteName  // gauge name
```

**Important:** The USGS response wraps everything in a deeply nested structure. The component should extract just the latest reading for each parameter code. Parameter codes: `00060` = discharge, `00010` = water temp, `00065` = gage height.

### Sunrise/Sunset Flow

```
LocalWeather.svelte mounts (already happens)
  Existing $effect() fetch to Open-Meteo
  CHANGE: Add &daily=sunrise,sunset&forecast_days=1 to existing URL
  Parse sunrise/sunset from response.daily.sunrise[0] / response.daily.sunset[0]
  Values are ISO 8601 strings: "2026-04-10T06:38", "2026-04-10T19:55"
  Format for display: "6:38 AM" / "7:55 PM"
```

**Verified working:** Open-Meteo returns ISO 8601 local times for the Tillamook coordinates. Single fetch per page load is sufficient — these times change by ~1 minute per day.

**No `suncalc` library needed.** Open-Meteo (already a dependency via `LocalWeather.svelte`) provides sunrise/sunset as a free parameter on the existing weather request. Adding `&daily=sunrise,sunset&forecast_days=1` to the current URL avoids a new dependency entirely.

### Fish Run Status Flow

```
FishRunStatus.svelte mounts
  Import static data from $lib/data/fish-runs.ts
  Read current month from new Date().getMonth()
  Map each species to status: "Peak Season" / "Present" / "Off Season"
  Display compact list
```

**Static data source:** Oregon fish run calendars are well-documented. Trask River species:

- Chinook Salmon: peak Sep-Nov, present Aug, Dec
- Coho Salmon: peak Oct-Nov, present Sep, Dec
- Winter Steelhead: peak Jan-Mar, present Dec, Apr
- Summer Steelhead: peak Jun-Jul, present May, Aug
- Chum Salmon: peak Oct-Nov, present Sep, Dec

This is a static TypeScript constant, not a database or API. Updated manually 1-2x/year if run patterns shift.

### Sidebar Layout Flow (Before vs After)

**Before (v1.0):**

```
Sidebar/Drawer
  if phase === 'viewing':  LocalWeather (full weather panel)
  else:                    PassDetailsPanel (specs + CTA)
  always:                  TelemetryFooter ("H.264 / 4.096 Mbps")
```

**After (v1.1):**

```
Sidebar/Drawer
  SidebarHeader (always visible)
    Branding: "Trask River Cam"
    Description: "Live cam for the Trask River..."
    Compact weather summary
  CTA Section (always visible, simplified from PassDetailsPanel)
    Start Stream button + status text
  RiverConditions (always visible)
    USGS: Flow, Gage Height, Water Temp
    Sunrise / Sunset
  FishRunStatus (always visible)
    Current fish run status by species
```

**Key layout changes:**

1. **No more panel swap.** The sidebar no longer alternates between `PassDetailsPanel` and `LocalWeather` based on phase. Everything is always visible.
2. **Phase affects CTA only.** The stream button text/state changes with phase, but the rest of the sidebar stays put.
3. **TelemetryFooter replaced.** "Encoding: H.264" is meaningless to anglers. River flow data replaces it.
4. **Weather is always visible.** Currently only shown in `viewing` phase. Now it's part of the always-visible sidebar header.
5. **Sidebar width may simplify.** Currently toggles between 420px (idle) and 300px (viewing). With a stable layout, a single width may suffice.

## Integration Points

### External Services

| Service                                                  | Integration Pattern                                         | Rate/Limits                                          | Notes                                                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Counterscale (`counterscale.jspn.workers.dev`)           | Script tag for pageviews + npm module for engagement events | 50k pageviews/day on free Workers tier               | Already deployed at that URL. Just needs tracker script and npm package added.         |
| USGS Instantaneous Values API (`waterservices.usgs.gov`) | Client-side `fetch()` from `RiverConditions.svelte`         | No auth required. CORS enabled. Will 403 if abusive. | Gauge 14302480 confirmed returning flow/temp/gage data. Data updates every 15 min.     |
| Open-Meteo Forecast API (`api.open-meteo.com`)           | Client-side `fetch()` from `LocalWeather.svelte` (existing) | Free, no API key. 10k requests/day.                  | Already integrated. Just add `daily=sunrise,sunset` parameter to existing request URL. |

### Internal Boundaries

| Boundary                            | Communication                                                            | Notes                                                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `+layout.svelte` → Counterscale     | `<script>` tag loads tracker.js; `$lib/analytics.ts` wraps npm package   | Layout is the single init point. `+page.svelte` calls `trackEvent()` at phase transitions.                                                                   |
| `+page.svelte` → Sidebar components | Props down (phase, handlers) for CTA; self-contained for data components | Same prop pattern as today. `SidebarHeader` and CTA get phase/handlers. `RiverConditions` and `FishRunStatus` are fully self-contained (no props from page). |
| `RiverConditions.svelte` → USGS API | Direct client-side fetch, self-managed state                             | Owns its own loading/error/data states. Same pattern as existing `LocalWeather.svelte`.                                                                      |
| `LocalWeather.svelte` → Open-Meteo  | Direct client-side fetch (existing)                                      | Just adding sunrise/sunset fields to existing fetch.                                                                                                         |

## Suggested Build Order

Build in this order — each step is independently shippable and testable:

### Step 1: Counterscale Analytics (no visual changes)

1. Install `@counterscale/tracker` npm package
2. Add `<script>` tag to `+layout.svelte` `<svelte:head>`
3. Create `$lib/analytics.ts` wrapper module
4. Verify pageviews appear in Counterscale dashboard
5. Add engagement tracking calls (`trackEvent`) at phase transitions in `+page.svelte`

**Rationale:** Zero visual impact. Can be verified immediately via Counterscale dashboard. Completely decoupled from all other changes.

### Step 2: Data Components (new components, no layout changes yet)

1. Create `$lib/data/fish-runs.ts` — static fish run data
2. Create `FishRunStatus.svelte` — renders fish run status from static data
3. Create `RiverConditions.svelte` — fetches USGS data, displays flow/temp/gage
4. Add `sunrise/sunset` to `LocalWeather.svelte`'s Open-Meteo fetch
5. Test each component in isolation (can temporarily render them in the existing sidebar to verify)

**Rationale:** Build data-fetching pieces before touching layout. Each component is self-contained and testable without restructuring the sidebar.

### Step 3: Sidebar Layout Overhaul (composition changes)

1. Create `SidebarHeader.svelte` — branding + compact weather
2. Simplify `PassDetailsPanel.svelte` to focused CTA-only component
3. Restructure `+page.svelte` sidebar composition:
   - Remove phase-based panel swap (`{#if phase === 'viewing'}` conditional)
   - Compose: SidebarHeader → CTA → RiverConditions → FishRunStatus
4. Remove `TelemetryFooter.svelte` import/usage
5. Copy and content cleanup for angler audience across all components

**Rationale:** Layout changes have the most visual regression risk and depend on Step 2 components existing. Doing this last means iterating on layout with real data visible.

### Dependency Graph

```
Step 1 (Analytics)     — independent
Step 2 (Data)          — independent
Step 3 (Layout)        — depends on Step 2 components
```

Steps 1 and 2 can be built in parallel. Step 3 must follow Step 2.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Server-Side Proxying Public APIs

**What:** Creating `+page.server.ts`, `/api/usgs/`, or `/api/sunrise/` routes that proxy public APIs through Cloudflare Workers.
**Why bad:** Wastes Workers CPU time on pass-through requests. Adds latency (client → CF Worker → USGS, vs client → USGS directly). Creates an unnecessary failure point. The app has zero server load functions today — introducing one solely to proxy a public, CORS-enabled API adds complexity for no benefit. USGS and Open-Meteo both support CORS.
**Instead:** Fetch directly from the client in self-contained components. Only proxy if an API requires server-side secrets.

### Anti-Pattern 2: Fetching USGS Data on Every Component Re-render

**What:** Putting the USGS fetch inside an unguarded `$effect` that re-fires when unrelated state changes.
**Why bad:** USGS data updates every 15 minutes. Fetching on every phase transition is wasteful and risks rate limiting.
**Instead:** Fetch once on mount. Use the `$effect` cleanup pattern (same as `LocalWeather.svelte`). No `setInterval` needed — anglers check conditions once, not continuously.

### Anti-Pattern 3: Conditional Rendering That Destroys Data Components

**What:** Using `{#if phase === 'viewing'}` to toggle between panels (current v1.0 pattern), causing components to unmount/remount and re-fetch data.
**Why bad:** `LocalWeather` re-fetches on every phase transition. Unnecessary network requests, loading spinners during transitions.
**Instead:** Keep data components always mounted in the sidebar. The v1.1 layout (always-visible weather + conditions) naturally avoids this.

### Anti-Pattern 4: Overloading +page.svelte

**What:** Adding USGS fetch logic, fish run tables, and sunrise/sunset formatting directly to `+page.svelte` (already 479 lines).
**Why bad:** The page is already at the complexity ceiling. More logic makes it unmaintainable.
**Instead:** Every new data concern gets its own component with self-contained fetch and display logic. `+page.svelte` only handles composition and phase state.

### Anti-Pattern 5: Counterscale Double-Loading

**What:** Using both the `<script>` tag (which auto-tracks pageviews) AND the npm module's `init()` with `autoTrackPageviews: true`.
**Why bad:** Records duplicate pageviews — one from the script tag's auto-tracking, one from the npm module's auto-tracking.
**Instead:** Script tag handles pageview tracking. npm module initialized with `autoTrackPageviews: false`, used only for programmatic engagement events via `trackPageview()` with synthetic URLs.

### Anti-Pattern 6: Adding suncalc or Similar Library

**What:** Installing `suncalc` npm package to compute sunrise/sunset times.
**Why bad:** Open-Meteo (already fetched for weather) provides sunrise/sunset as a free parameter. Adding a separate library for what a single URL parameter already provides is unnecessary dependency bloat.
**Instead:** Add `&daily=sunrise,sunset&forecast_days=1` to the existing Open-Meteo request in `LocalWeather.svelte`.

### Anti-Pattern 7: Over-Caching USGS Data in KV

**What:** Storing USGS responses in Cloudflare KV to reduce API calls.
**Why bad:** Adds KV write complexity, TTL management, and stale-read logic for a site with likely <100 concurrent users. The browser's own HTTP cache and USGS's response headers handle this naturally.
**Instead:** Let the browser cache the USGS response. One fetch per page load per user is fine.

## Cloudflare Workers Constraints

| Constraint                                | Impact on v1.1                                              | Mitigation                                                                                                                         |
| ----------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| No Node.js APIs                           | Cannot use `node:` modules in server routes                 | Not relevant — new features are client-side only                                                                                   |
| CPU time limits (10ms free, 30ms paid)    | Server-side API proxying would consume budget               | Client-side fetching avoids this entirely                                                                                          |
| KV write limits (1,000/day free)          | Already constrained for demand/status                       | No new KV writes needed for v1.1                                                                                                   |
| `<script>` tag SSR handling               | Counterscale script must reach document `<head>`            | SvelteKit `<svelte:head>` in `+layout.svelte` handles this correctly                                                               |
| `experimental: { async: true }` in config | Enables `{#await}` blocks and top-level await in components | Already enabled — can use `{@const stream = await getStreamInfo()}` pattern. New components can use `{#await}` for loading states. |

## Sources

- **Counterscale integration:** https://counterscale.dev, https://github.com/benvinegar/counterscale — confirmed script tag pattern, npm module with `trackPageview()`, v3.4.1 current. npm package: `@counterscale/tracker`. — **HIGH confidence**
- **USGS Instantaneous Values API:** https://waterservices.usgs.gov/nwis/iv/ — confirmed gauge 14302480 ("TRASK RIVER ABOVE CEDAR CREEK, NEAR TILLAMOOK, OR") returns discharge (00060), water temp (00010), gage height (00065) in JSON format. CORS supported. Live response verified: 407 cfs, 12.7C, 6.66 ft. — **HIGH confidence**
- **Open-Meteo sunrise/sunset:** https://api.open-meteo.com — confirmed `daily=sunrise,sunset` param works for Tillamook coordinates (45.4562, -123.844). Returns ISO 8601 local times. Already integrated for weather; just needs additional parameter. — **HIGH confidence**
- **Existing codebase:** Direct inspection of all 18 Svelte components, 3 API routes, 1 remote function module, shared types, config files. — **HIGH confidence**

---

_Architecture research for: Trask River Cam v1.1_
_Researched: 2026-04-10_
