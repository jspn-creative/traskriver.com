# Pitfalls Research

**Domain:** Adding analytics, environmental data, and sidebar overhaul to existing live-streaming river cam
**Researched:** 2026-04-10
**Confidence:** HIGH (verified against Counterscale source, USGS official docs, codebase analysis)

---

## Critical Pitfalls

### Pitfall 1: Counterscale Does Not Support Custom Events

**What goes wrong:** The PROJECT.md lists "custom engagement events" as a target feature for Counterscale. As of v3.4.1 (Dec 2025), Counterscale only supports pageview tracking. Custom event tracking is an open feature request (GitHub issue #200, Jul 2025, status: open/unresolved). Trying to build custom engagement analytics (stream start, stream viewed, drawer open) against Counterscale's API will hit a wall — there is no `trackEvent()` method, no event schema, and no dashboard UI for events.

**Why it happens:** Counterscale is a privacy-friendly pageview counter, not a full analytics platform. Its tracker only exports `init()`, `trackPageview()`, `isInitialized()`, `getInitializedClient()`, and `cleanup()`. The `/collect` endpoint only accepts pageview-shaped data (hostname, path, referrer, UTM params, hit type).

**How to avoid:**

- Scope Counterscale integration to what it actually does: unique visitors, page views, referrers, and UTM tracking. This is still highly valuable for understanding where anglers find the site.
- For engagement events (stream started, stream viewed duration, drawer interactions), use a virtual pageview workaround: `trackPageview({ url: '/event/stream-started' })`. This shows up in Counterscale's path-based analytics and requires zero backend changes. Label these paths clearly (e.g., `/event/stream-start`, `/event/stream-viewing`) so they're distinguishable from real pageviews.
- Alternatively, defer true custom event tracking to a future milestone when Counterscale adds the feature, or use Cloudflare Analytics Engine directly.

**Warning signs:** Feature spec referencing `Counterscale.trackEvent()` or similar; planning custom dashboard views in Counterscale.

**Phase to address:** Phase 1 (Analytics integration) — scope must be adjusted at the start.

---

### Pitfall 2: USGS API Returns 403 When Over-Polled — IP Gets Blocked

**What goes wrong:** The USGS Water Services API will block your IP (403 Forbidden) if it detects excessive polling. The official docs explicitly warn: "if the USGS determines that your usage is excessive, your IP(s) may be blocked." Since this app runs on Cloudflare Workers, the outbound IP is a Cloudflare edge IP — meaning a block could affect your Worker's requests to USGS.

**Why it happens:** Client-side fetching from every visitor session to `waterservices.usgs.gov` multiplies request volume proportionally to traffic. Even server-side, polling per-request (in a `+page.server.ts` load function without caching) with 100 visitors/day × page loads could hit hundreds of requests per hour to USGS.

**How to avoid:**

- USGS data updates at most hourly (sensors transmit to satellite once per hour). Official guidance: "For instantaneous values, polling hourly is usually sufficient."
- Implement server-side caching: fetch USGS data from a SvelteKit API route, cache in KV with a 30-60 minute TTL, serve from cache. Never fetch USGS from the client directly.
- Use the JSON format (`format=json`) per USGS recommendation for browser/client-based apps.
- Request only the parameters you need: `parameterCd=00060,00010` (discharge + water temp) for site `14302480`.
- Use `Accept-Encoding: gzip` in fetch headers per USGS recommendation.

**Warning signs:** Direct `fetch()` to `waterservices.usgs.gov` in client-side Svelte components; no caching layer; polling intervals < 30 minutes.

**Phase to address:** Phase 2 (River conditions) — must be designed correctly from the start.

---

### Pitfall 3: Monolithic +page.svelte Refactor Breaks Stream State Machine

**What goes wrong:** The current `+page.svelte` is 479 lines containing a complex stream lifecycle state machine (idle → starting → live → viewing → ended → error, with sub-states like `ended_confirming` and `unavailable`). Extracting components from this file risks breaking the tightly coupled state transitions — particularly the polling effects, demand registration, and phase-dependent UI rendering.

**Why it happens:** The state machine has multiple `$effect()` blocks that read and write shared `$state()` variables. These effects interact through implicit ordering: the polling effect reads `polling`, the phase effect logs state changes, the prefetch effect runs once. When you extract a component, you need to decide whether state lives in the parent or is passed down — and the stream lifecycle state is deeply intertwined with both the video player area and the sidebar content.

**How to avoid:**

- Do NOT refactor the state machine AND overhaul the sidebar simultaneously. Separate concerns:
  1. First, overhaul sidebar content (swap PassDetailsPanel conditional for always-visible layout) while keeping all state in `+page.svelte`.
  2. Only after the sidebar works, consider extracting the stream state machine to a separate module (e.g., `stream-state.svelte.ts` using Svelte 5 rune-based state) in a later phase.
- The sidebar overhaul should be additive: the `{#if phase === 'viewing'}` conditional that toggles between PassDetailsPanel and LocalWeather needs to become an always-visible layout. This can be done without touching the state machine code.
- Write a manual state transition test checklist before any refactoring: idle→starting, starting→live, live→viewing, viewing→ended, etc.

**Warning signs:** PR that changes both the state machine logic and the sidebar layout; new components that import and re-export state variables from the parent; broken polling after refactor.

**Phase to address:** Phase 3 (Sidebar overhaul) — decompose incrementally, test transitions between each change.

---

### Pitfall 4: Cloudflare Workers USGS Fetch — Response Parsing Fragility

**What goes wrong:** The USGS JSON response wraps data in a Java-serialized WaterML structure: `response.value.timeSeries[n].values[0].value[0].value`. It returns `declaredType`, `scope`, `typeSubstituted` metadata from the Java serializer. A missing parameter (e.g., temperature sensor offline) silently returns an empty `timeSeries` array — no error, just absent data. Naively assuming array indexes will cause runtime crashes.

**Why it happens:** The API is designed for flexibility (multiple sites, parameters, time ranges) creating deep nesting even for single-site queries. The order of timeSeries entries is not guaranteed — discharge might be index 0 or index 1 depending on internal processing.

**How to avoid:**

- Match by `variableCode[0].value` (e.g., `"00060"` for discharge, `"00010"` for temperature), never by array index.
- Use optional chaining throughout the parser.
- Handle USGS 404 correctly — it means "no data exists for this query," not "site not found." If the Trask River gauge goes offline, the API returns 404 for that parameter, not an empty result.
- Build a thin parsing utility that extracts exactly what's needed (latest discharge, latest temp, timestamp) and validates the response shape.
- Verified: site 14302480 returns both `00060` (discharge, 407 cfs) and `00010` (water temp, 12.7°C) as of 2026-04-10.

**Warning signs:** Parsing code that assumes timeSeries array always has two entries; no handling for 404 "no data" responses; array index-based access.

**Phase to address:** Phase 2 (River conditions) — build robust parsing from the start.

---

### Pitfall 5: KV Write Limits Exhausted by Adding USGS Caching to Existing Demand Writes

**What goes wrong:** Cloudflare KV free tier allows 1,000 writes/day. The existing demand endpoint already uses KV writes (every 30s throttled per user). Adding USGS data caching to KV stacks on top. If traffic spikes and demand writes consume most of the budget, USGS cache refresh fails and serves stale data indefinitely.

**Why it happens:** The current `demand/+server.ts` gracefully handles KV write failures (logs and continues), but a USGS caching layer using the same KV namespace adds another consumer of the same write budget.

**How to avoid:**

- Calculate worst-case budget: USGS cache refresh every 60 min = 24 writes/day. Demand writes with 30s throttle, if N users each trigger demand once per session: N writes/day. Budget: 1,000 - 24 = 976 for demand. Fine for expected traffic (< 100 users/day).
- Log KV write failures so you know if the limit is being approached.
- Use KV `expirationTtl` on USGS cache puts to auto-expire stale data.
- KV is eventually consistent — a write from one edge location may not be immediately visible from another. For a single-region user base (Oregon anglers), this is unlikely to matter.

**Warning signs:** KV put errors in production logs; USGS data showing as stale for extended periods; demand writes silently failing.

**Phase to address:** Phase 2 (River conditions) — design KV usage budget upfront.

---

## Technical Debt Patterns

| Shortcut                                                              | Immediate Benefit                 | Long-term Cost                                                        | When Acceptable                                                         |
| --------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Virtual pageviews instead of custom events                            | Works now with Counterscale as-is | Pollutes pageview data; harder to distinguish real vs event pageviews | Acceptable for v1.1 with clear `/event/...` prefix naming convention    |
| Inline USGS fetch in +page.server.ts load                             | Quick to implement                | No caching, USGS called per page load, risk of rate limiting          | Never — always cache server-side                                        |
| Keep all state in +page.svelte                                        | No refactoring risk               | 500+ line file grows as features are added                            | Acceptable for v1.1; sidebar adds content, not state logic              |
| Hardcoded fish run dates in component                                 | No API/DB needed                  | Needs manual update each year                                         | Acceptable — fish runs are seasonal and predictable; update annually    |
| Direct USGS client-side fetch (like LocalWeather does for open-meteo) | Simpler, no API route needed      | Every visitor hits USGS, risk of IP block                             | Never acceptable for USGS (unlike open-meteo, which has no rate limits) |

---

## Integration Gotchas

| Integration                                  | Common Mistake                                                                                                  | Correct Approach                                                                                                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Counterscale tracker in SvelteKit            | Loading tracker in SSR context — `window` is undefined on server                                                | Use `onMount()` or `browser` check from `$app/environment` to init tracker client-side only. The tracker uses `window.location`, `document.referrer`, `document.querySelector`. |
| Counterscale `reporterUrl`                   | Setting to dashboard URL instead of collect endpoint                                                            | Must point to `https://counterscale.jspn.workers.dev/collect`, not the dashboard root.                                                                                          |
| Counterscale on localhost                    | Tracker silently no-ops on localhost by default                                                                 | Set `reportOnLocalhost: true` during dev to verify tracking; remove for production.                                                                                             |
| Counterscale SPA navigation                  | `autoTrackPageviews` instruments `history.pushState`/`replaceState` — verify this works with SvelteKit's router | Test: navigate between views, check Counterscale dashboard. If only initial page shows, use `afterNavigate` + manual `trackPageview()`.                                         |
| USGS JSON response ordering                  | Assuming timeSeries array index 0 is always discharge                                                           | Match by `variableCode[0].value` (e.g., `"00060"` for discharge, `"00010"` for temp), not by array index.                                                                       |
| USGS provisional data                        | Displaying raw values without qualification                                                                     | All current USGS data is marked provisional (`qualifiers: ["P"]`). Show a discrete footnote per USGS guidance.                                                                  |
| USGS date/time                               | Parsing without timezone awareness                                                                              | USGS returns ISO 8601 with timezone offsets (e.g., `-07:00` for PDT). Parse with timezone-aware code.                                                                           |
| Sunrise/sunset calculation                   | Using a library with Node.js dependencies                                                                       | On Cloudflare Workers, no `node:` modules unless explicitly enabled. Use a pure-JS solar calculation or lightweight library with no Node deps.                                  |
| Sunrise/sunset timezone display              | Formatting Date objects without explicit timezone                                                               | On Workers, the runtime timezone is UTC. Use `Intl.DateTimeFormat` with explicit `timeZone: 'America/Los_Angeles'`. Never use `toLocaleTimeString()` without a timezone option. |
| Svelte 5 transitions during sidebar overhaul | `in:fade`/`out:fade` on conditional blocks that change during refactor                                          | Current `{#if phase === 'viewing'}` has `out:fade`/`in:fade` transitions. Changing condition logic to always-visible means these transitions need rethinking.                   |
| vaul-svelte drawer with layout change        | Drawer configured `modal={drawerDirection === 'bottom'}` (non-modal on desktop)                                 | Sidebar overhaul changes DrawerContent children from conditional `{#if}/{:else}` to stacked layout. Test drawer open/close isn't broken.                                        |

---

## Performance Traps

| Trap                                                                   | Symptoms                                                                                             | Prevention                                                                                                                                                | When It Breaks                                                         |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| USGS fetch in client component (like LocalWeather does for open-meteo) | Every page load triggers external API call; USGS is slower (~500-1500ms); layout shift while loading | Fetch server-side, cache in KV, serve cached data through load function                                                                                   | At any traffic level — USGS rate limits + unpredictable response times |
| Counterscale npm package loaded synchronously                          | Blocks initial render if import is in module scope and init runs before mount                        | Init in `onMount()` only; the npm package approach is better than CDN script — it tree-shakes and avoids extra network request                            | On slow mobile connections                                             |
| Multiple `$effect()` chains cascading                                  | UI flickers during phase transitions; visible repaints                                               | Current 6+ `$effect()` blocks are already at risk. Adding effects for USGS refresh, tracking, sunrise recalc compounds it. Use `$derived` where possible. | When 3+ features each add their own `$effect()`                        |
| Large USGS JSON parsed on every KV miss                                | Parsing WaterML JSON on edge adds latency; response 5-15KB                                           | Parse once server-side, cache only extracted values (~100 bytes vs 15KB)                                                                                  | When KV cache misses coincide with high traffic                        |
| Open-meteo + USGS + sunrise fetched sequentially                       | 3 separate loading spinners; stacked wait times                                                      | Fetch open-meteo and USGS in parallel (both server-side); sunrise is pure calculation. Pre-compute all in single server load function.                    | Visible as poor UX — 3 loading states in sidebar                       |

---

## UX Pitfalls

| Pitfall                                                    | User Impact                                                                                                      | Better Approach                                                                                                                                                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Showing "407 ft³/s" without context                        | Anglers need to know if 407 cfs is high or low for fishing; bare number is meaningless                           | Show value with qualitative label: "407 cfs — moderate flow" or simple color indicator. Define thresholds (e.g., < 200 = low/wadeable, 200-600 = moderate/good, > 600 = high/muddy).      |
| Water temperature in Celsius                               | USGS returns °C; Oregon anglers think in °F                                                                      | Convert server-side. LocalWeather already uses `temperature_unit=fahrenheit` for open-meteo.                                                                                              |
| Stale USGS data with no staleness indicator                | Cached value could be hours old if gauge offline (common in winter storms); user thinks it's current             | Show "as of [time]" next to values. If > 2 hours old, add "data may be stale" indicator. If > 24 hours, show "gauge offline."                                                             |
| Fish run status as wall of text                            | Static seasonal data takes up valuable sidebar space                                                             | Compact, scannable: single-line per species (e.g., "Steelhead: In-Season" / "Chinook: Off-season"). Expandable section for details.                                                       |
| Sidebar too information-dense                              | Making everything always-visible in 300-420px risks cramming weather + controls + river conditions + fish status | Prioritize hierarchy: (1) stream start button, (2) current conditions summary, (3) river conditions. Collapsible sections for lower-priority info. Test on mobile drawer with max-h 85vh. |
| Counterscale tracker from CDN adds cross-origin dependency | If Counterscale Worker is slow/down, it adds latency or error                                                    | Use npm package (`@counterscale/tracker`) — bundles into app JS, no cross-origin script load. Only `/collect` beacon is cross-origin (fire-and-forget).                                   |

---

## "Looks Done But Isn't" Checklist

- [ ] **Counterscale reports pageviews** — but does SPA navigation tracking actually fire? Test: navigate around, check dashboard after 5 min (Analytics Engine has ingestion delay).
- [ ] **USGS data shows in sidebar** — but what happens when gauge is offline? Test with non-existent site number to simulate 404; test with site missing temperature to simulate partial response.
- [ ] **Sunrise/sunset shows correct time** — but does it account for DST? Trask River is Pacific Time. Test around DST transition dates. Does it show tomorrow's sunrise after today's sunset has passed?
- [ ] **Fish run status is correct** — are date ranges verified against ODFW published seasons?
- [ ] **Sidebar shows all sections on desktop** — but does mobile drawer still work? Test on iPhone SE with max-h-[85vh].
- [ ] **Stream start button still works after sidebar overhaul** — is it visible without scrolling? Current PassDetailsPanel puts CTA at `mt-auto`. In stacked layout, could be pushed below fold.
- [ ] **KV caching works for USGS** — but does first user after cache expiry see acceptable load times? Test cold-cache scenario. Is there a loading skeleton?
- [ ] **Counterscale doesn't fire on localhost** — but did you verify it DOES fire on production domain? Default `reportOnLocalhost: false` could mask misconfigured `reporterUrl`.
- [ ] **USGS provisional data disclaimer** — USGS requires consumers to qualify provisional data. A small footnote satisfies this.
- [ ] **Virtual pageview events have `/event/` prefix** — verify they show up in Counterscale dashboard as distinct paths, not mixed with real page analytics.

---

## Pitfall-to-Phase Mapping

| Pitfall                                    | Prevention Phase           | Verification                                                                       |
| ------------------------------------------ | -------------------------- | ---------------------------------------------------------------------------------- |
| Counterscale lacks custom events           | Phase 1 (Analytics)        | Scope limited to pageviews + virtual pageview events; document what's tracked      |
| Counterscale SSR `window` crash            | Phase 1 (Analytics)        | `npm run build && npm run preview` — no SSR errors                                 |
| Counterscale SPA navigation tracking       | Phase 1 (Analytics)        | Navigate around app, verify multiple pageviews in dashboard                        |
| `reporterUrl` pointing to wrong endpoint   | Phase 1 (Analytics)        | Confirm hits appear in Counterscale dashboard within 5 min of deploy               |
| USGS over-polling / IP block               | Phase 2 (River conditions) | KV cache TTL is 30-60min; no direct USGS fetch from client components              |
| USGS response parsing fragility            | Phase 2 (River conditions) | Test with offline gauge, partial data, normal data; match by param code not index  |
| USGS data staleness hidden from user       | Phase 2 (River conditions) | "as of" timestamp visible; stale/offline indicator at 2h/24h thresholds            |
| KV write budget exhaustion                 | Phase 2 (River conditions) | Log KV write failures; worst-case daily budget calculated                          |
| Water temp in wrong units (°C vs °F)       | Phase 2 (River conditions) | Verify °F conversion; compare against USGS web page for same gauge                 |
| Sunrise/sunset DST/timezone handling       | Phase 2 (River conditions) | Test near DST transitions; explicit `America/Los_Angeles` timezone                 |
| Sidebar refactor breaks state machine      | Phase 3 (Sidebar overhaul) | Manual test all transitions: idle→starting→live→viewing→ended; idle→starting→error |
| Mobile drawer overflow                     | Phase 3 (Sidebar overhaul) | Test on iPhone SE and small Android viewports; verify scrollability                |
| Stream start button below fold             | Phase 3 (Sidebar overhaul) | CTA visible without scrolling on desktop and mobile                                |
| Svelte transition bugs after layout change | Phase 3 (Sidebar overhaul) | No flash-of-content or ghost transitions when sidebar content is always visible    |
| Fish run dates incorrect                   | Phase 3 (Content)          | Cross-reference with ODFW published season dates                                   |

---

## Sources

- **Counterscale GitHub:** https://github.com/benvinegar/counterscale — v3.4.1 source code, README, issue #200 (custom events not supported)
- **Counterscale tracker source:** `packages/tracker/src/` — verified API surface: `init`, `trackPageview`, `cleanup` only; no `trackEvent`
- **USGS Writing Fault Resistant Code:** https://waterservices.usgs.gov/docs/writing-fault-resistant-code/ — official guidance on polling frequency, IP blocking, data formats
- **USGS Instantaneous Values Service Details:** https://waterservices.usgs.gov/docs/instantaneous-values/instantaneous-values-details/ — API reference, error codes, CORS support
- **USGS API live test:** `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=14302480&parameterCd=00060,00010&period=PT2H` — confirmed Trask River gauge returns discharge (407 cfs) and water temp (12.7°C) as of 2026-04-10
- **Cloudflare Workers Fetch API:** https://developers.cloudflare.com/workers/runtime-apis/fetch/ — runtime constraints
- **Codebase analysis:** `+page.svelte` (479 lines), `stream.remote.ts`, `demand/+server.ts`, `LocalWeather.svelte`, `LiveViewerCount.svelte`, `wrangler.jsonc`, `app.d.ts`

---

_Pitfalls research for: Trask River Cam v1.1_
_Researched: 2026-04-10_
