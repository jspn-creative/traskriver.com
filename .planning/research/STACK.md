# Stack Research

**Domain:** Live-streaming river cam with analytics and environmental data
**Researched:** 2026-04-10
**Confidence:** HIGH

## Recommended Stack Additions

### Analytics: Counterscale

| Technology              | Version  | Purpose                                     | Why Recommended                                                                                                                                                                                                                                       |
| ----------------------- | -------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@counterscale/tracker` | `^3.4.1` | Client-side page view + engagement tracking | Already have Counterscale deployed at `counterscale.jspn.workers.dev`. The npm module gives programmatic control (manual pageviews, SPA navigation tracking) which is better for a SvelteKit SPA than the `<script>` tag approach. Zero dependencies. |

**Integration approach:** Use the npm module, NOT the `<script>` tag.

- Import in `+layout.svelte` and call `init()` in an `$effect`.
- Set `autoTrackPageviews: false` because SvelteKit uses client-side navigation — auto-tracking fires on initial load only. Instead, manually call `trackPageview()` on SvelteKit's `afterNavigate`.
- **IMPORTANT API note:** The npm README on npmjs.com (v3.4.1) shows `deploymentUrl` but this is **wrong/stale**. The actual source code uses `reporterUrl` (confirmed by reading `packages/tracker/src/shared/types.ts` and `packages/tracker/src/lib/client.ts`). Use `reporterUrl`.
- The `reporterUrl` should point to `https://counterscale.jspn.workers.dev/collect`.

**Configuration:**

```typescript
import * as Counterscale from '@counterscale/tracker';

Counterscale.init({
	siteId: 'traskriver-cam',
	reporterUrl: 'https://counterscale.jspn.workers.dev/collect',
	autoTrackPageviews: false // SPA — track manually
});
```

**Custom events:** Counterscale does NOT support custom events out of the box — it tracks pageviews only. For engagement events (stream-started, stream-watched-5min), you'd need to send synthetic "pageview" calls with custom paths like `/event/stream-started`. This is a known pattern with Counterscale and documented in community discussions.

### Sunrise/Sunset: suncalc

| Technology       | Version  | Purpose                                          | Why Recommended                                                                                                                                                                                 |
| ---------------- | -------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `suncalc`        | `^1.9.0` | Calculate sunrise/sunset times for Tillamook, OR | Pure math library — zero dependencies, zero API calls, works in any JS runtime including Cloudflare Workers. 3.4k GitHub stars, 137k weekly downloads. By Vladimir Agafonkin (created Leaflet). |
| `@types/suncalc` | `^1.9.2` | TypeScript definitions                           | Needed since suncalc is plain JS with no built-in types.                                                                                                                                        |

**Why a library, not an API:**

- Sunrise/sunset is a deterministic calculation from lat/lng + date — no need for a network call.
- No API key, no rate limits, no failure modes, no latency.
- `suncalc` is ~2KB, well-tested, and works on both client and server.
- Can compute on the server in a SvelteKit `load` function or on the client — either works.

**Usage:**

```typescript
import SunCalc from 'suncalc';

// Trask River location: 45.4462, -123.7104
const times = SunCalc.getTimes(new Date(), 45.4462, -123.7104);
// times.sunrise, times.sunset → Date objects
```

### USGS River Data: Native fetch (NO library needed)

| Technology     | Version | Purpose                            | Why Recommended                                                                                                                  |
| -------------- | ------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Native `fetch` | —       | Fetch USGS Water Services API data | The USGS API is a simple REST JSON endpoint. No SDK exists, and none is needed. A plain `fetch` call returns everything we need. |

**API endpoint (verified working as of 2026-04-10):**

```
https://waterservices.usgs.gov/nwis/iv/?format=json&sites=14302480&parameterCd=00060,00010,00065
```

**Gauge verified:** USGS site `14302480` = "TRASK RIVER ABOVE CEDAR CREEK, NEAR TILLAMOOK, OR"

- Location: 45.4462181, -123.7103974
- Parameter codes:
  - `00060` — Streamflow (ft³/s) — currently 407 cfs
  - `00010` — Water temperature (°C) — currently 12.7°C
  - `00065` — Gage height (ft) — currently 6.66 ft

**Key API details:**

- **CORS enabled** — can call from browser or server
- **JSON format** — returns WaterML 1.1 in JSON structure
- **No API key required** — public, free, rate-limit by IP (generous)
- **Data freshness:** Readings every 15 minutes, transmitted hourly
- **Period parameter:** Use `&period=P1D` for last 24 hours, or omit for latest value only

**Response structure (verified):**

```
response.value.timeSeries[n].values[0].value[0].value  // the reading
response.value.timeSeries[n].values[0].value[0].dateTime  // timestamp
response.value.timeSeries[n].variable.variableName  // "Streamflow, ft³/s"
```

**Where to call from:** Server-side in a SvelteKit `load` function (or a server route). This avoids CORS complexity, lets us cache with appropriate headers, and keeps the API call off the client. Use SvelteKit's `fetch` in `+page.server.ts` or `+layout.server.ts`.

### Fish Run Data: Static (NO library needed)

| Technology             | Version | Purpose                                           | Why Recommended                                                                                                                                  |
| ---------------------- | ------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Static TypeScript data | —       | Seasonal fish run status for Tillamook Bay rivers | Fish runs follow predictable seasonal patterns. A static lookup table keyed by month is the right approach — no API exists for this data anyway. |

**Data shape:**

```typescript
type FishRun = {
	species: string;
	months: number[]; // 1-12
	status: 'peak' | 'present' | 'off';
};
```

Species for Trask River: Chinook (fall), Coho, Steelhead (winter + summer), Chum.

## Supporting Libraries

| Library          | Version  | Purpose                      | When to Use                      |
| ---------------- | -------- | ---------------------------- | -------------------------------- |
| `@types/suncalc` | `^1.9.2` | TypeScript types for suncalc | Always — project uses TypeScript |

## Installation

```bash
# In packages/web
bun add @counterscale/tracker suncalc
bun add -D @types/suncalc
```

**That's it.** Three packages total. Everything else uses native platform APIs.

## Alternatives Considered

| Category       | Recommended                        | Alternative                       | Why Not                                                                                                                                        |
| -------------- | ---------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Analytics      | `@counterscale/tracker` npm module | Counterscale `<script>` tag (CDN) | Script tag only auto-tracks initial load — misses SPA navigations. npm module gives programmatic control for manual pageview tracking.         |
| Analytics      | `@counterscale/tracker` npm module | Plausible, Fathom, Umami          | Already have Counterscale deployed and running on Cloudflare Workers. No reason to switch.                                                     |
| Sunrise/sunset | `suncalc` library                  | sunrise-sunset.org API            | API adds latency, failure mode, and rate limits for something that's pure math. Library is deterministic.                                      |
| Sunrise/sunset | `suncalc` library                  | `suncalc3` (fork)                 | suncalc3 adds solar radiation and refraction corrections we don't need. Original suncalc is simpler and sufficient for sunrise/sunset display. |
| USGS data      | Native fetch                       | `usgs-waterservices` npm          | No maintained npm package exists. The API is a single REST call — a wrapper library would be over-engineering.                                 |
| USGS data      | Server-side fetch                  | Client-side fetch                 | Server-side is better: can cache responses, avoids CORS headers in browser, reduces client bundle.                                             |
| Fish run data  | Static TypeScript table            | ODFW API                          | No public API exists for fish run timing. ODFW publishes this as reports/PDFs. Static data updated annually is the pragmatic choice.           |

## What NOT to Use

| Avoid                                     | Why                                                                                                                                                                  | Use Instead                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Counterscale `<script>` tag               | Doesn't fire on SPA navigations in SvelteKit; no programmatic control for engagement events                                                                          | `@counterscale/tracker` npm module with manual `trackPageview()` |
| Any sunrise/sunset API                    | Unnecessary network dependency for deterministic math                                                                                                                | `suncalc` library                                                |
| `node-fetch` or `axios`                   | Not needed — SvelteKit provides `fetch` in load functions, Cloudflare Workers has native `fetch`                                                                     | Native `fetch`                                                   |
| `date-fns` or `dayjs` for date formatting | Overkill for formatting 2 timestamps. Use `Intl.DateTimeFormat` which is built into all runtimes                                                                     | `Intl.DateTimeFormat` with `America/Los_Angeles` timezone        |
| `zod` for USGS response validation        | The USGS API response is deeply nested but stable. A simple type assertion + optional chaining is sufficient. Adding zod would be over-engineering for one API call. | TypeScript types + defensive access patterns                     |
| Any caching library                       | SvelteKit's built-in response headers + Cloudflare's edge cache handle this                                                                                          | `setHeaders({ 'Cache-Control': '...' })` in load functions       |

## Integration Notes

### Cloudflare Workers Runtime Compatibility

All recommended additions are compatible with Cloudflare Workers:

1. **`@counterscale/tracker`** — Client-side only (runs in browser), so Workers runtime is irrelevant. Zero Node.js dependencies.

2. **`suncalc`** — Pure JavaScript math (trigonometry). No Node.js APIs, no `fs`, no `crypto`. Works everywhere: browser, Workers, Bun, Node. Can run server-side in a SvelteKit load function on Workers.

3. **USGS fetch** — Uses native `fetch` which is available in Cloudflare Workers. No Node.js-specific APIs needed.

4. **`Intl.DateTimeFormat`** — Available in Cloudflare Workers runtime. Use for formatting sunrise/sunset times and USGS timestamps in `America/Los_Angeles` timezone.

### Data Flow Architecture

```
Client (browser)                    Server (Cloudflare Workers)
─────────────────                   ─────────────────────────────
@counterscale/tracker ─────────────→ counterscale.jspn.workers.dev
  (pageviews, events)

SvelteKit page load ←──────────────── +page.server.ts / +layout.server.ts
  (river data, sunrise/sunset)          ├── fetch USGS API → cache 15min
                                        ├── suncalc.getTimes() → cache 1hr
                                        └── static fish run lookup → no cache needed
```

### Caching Strategy

| Data            | Cache Duration    | Rationale                                                    |
| --------------- | ----------------- | ------------------------------------------------------------ |
| USGS river data | 10-15 min         | USGS updates every 15 min; match their frequency             |
| Sunrise/sunset  | 1 hour            | Changes by ~1 min/day; hourly recalc is more than sufficient |
| Fish run status | No caching needed | Static data, changes monthly                                 |

Use SvelteKit's `setHeaders` in server load functions:

```typescript
export const load = async ({ setHeaders, fetch }) => {
	setHeaders({ 'Cache-Control': 'public, max-age=900' }); // 15 min
	// ...
};
```

### Counterscale Integration Points

| Event                   | How to Track                                       | Implementation                    |
| ----------------------- | -------------------------------------------------- | --------------------------------- |
| Page load               | `trackPageview()` in `afterNavigate`               | `+layout.svelte`                  |
| Stream started          | `trackPageview({ path: '/event/stream-started' })` | Stream start handler              |
| Extended viewing (5min) | `trackPageview({ path: '/event/watched-5min' })`   | `setTimeout` after stream playing |

### USGS API Fault Tolerance

The USGS API is reliable but not 100% uptime. Handle gracefully:

- If fetch fails → show "River data temporarily unavailable" in the footer
- If response returns no data (404) → show "No current readings" with link to USGS site
- Always display data age: "Updated 23 min ago" from the `dateTime` field
- Consider: if the gauge goes offline (storm damage), readings will be stale — show a warning if data is >2 hours old

## Sources

- **Counterscale GitHub:** https://github.com/benvinegar/counterscale — v3.4.1, MIT license (confirmed 2026-04-10)
- **Counterscale tracker source code:** Verified `reporterUrl` (not `deploymentUrl`) is the correct config key by reading `packages/tracker/src/shared/types.ts` and `packages/tracker/src/lib/client.ts` directly
- **@counterscale/tracker npm:** https://www.npmjs.com/package/@counterscale/tracker — v3.4.1, 0 dependencies
- **suncalc GitHub:** https://github.com/mourner/suncalc — v1.9.0, BSD-2-Clause, 3.4k stars, 137k weekly npm downloads
- **suncalc npm:** https://www.npmjs.com/package/suncalc — v1.9.0, last publish 4 years ago (stable, no recent changes needed)
- **USGS Water Services API:** https://waterservices.usgs.gov/docs/instantaneous-values/instantaneous-values-details/ — REST API with CORS support, JSON format
- **USGS Trask River gauge verified:** https://waterservices.usgs.gov/nwis/iv/?format=json&sites=14302480&parameterCd=00060,00010,00065 — Returns streamflow, temperature, gage height (tested live 2026-04-10)

---

_Stack research for: Trask River Cam v1.1_
_Researched: 2026-04-10_
