# Phase 2: Sidebar & Content Overhaul - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the product-page-style sidebar with angler-relevant content. Weather and stream controls become always visible regardless of stream state. The sidebar conditional swap (`{#if phase === 'viewing'}`) is removed in favor of a static stacked layout. Stream state machine logic in `+page.svelte` is NOT touched — only sidebar content and layout change.

</domain>

<decisions>
## Implementation Decisions

### Sidebar layout structure

- **D-01:** Fixed button + scrollable content — stream button is pinned (sticky) at the bottom of the sidebar. Branding, description, and weather scroll above it. Guarantees the button is always visible without scrolling.
- **D-02:** No conditional content swaps — same sidebar content regardless of stream state. The `{#if phase === 'viewing'}` swap between PassDetailsPanel and LocalWeather is removed entirely. Branding, weather, and button are always present.
- **D-03:** Keep existing dual-width behavior — sidebar stays `300px` during viewing and `420px` otherwise. The width transition remains as-is.
- **D-04:** Mobile drawer mirrors desktop — same always-visible layout (branding, weather, sticky button) in the bottom drawer. Watch for overflow on smaller screens.

### Branding & description copy

- **D-05:** Simple text header — "Trask River Cam" in the existing display font with "Tillamook, OR" subtitle. No logo or icon. Clean, matches the existing header style in the main view area.
- **D-06:** Brief river description — mention that the Trask River is known for its runs of Steelhead and Chinook salmon, but keep it general-purpose and brief. Not narrowly targeted at anglers — the river context speaks for itself.

### Stream button behavior

- **D-07:** Button shows "Streaming" in a disabled/success state during active viewing. Users cannot restart the stream while it's playing — the button only becomes actionable again when the stream ends.
- **D-08:** Keep both overlay and sidebar restart paths — the main-area overlay restart buttons ("Watch again", "Try again") remain alongside the sidebar button. Two paths to restart, neither hidden.
- **D-09:** Existing phase-aware labels preserved for non-viewing states: "Start stream" (idle), "Starting stream..." (starting), "Stream ended" (ended), "Try starting stream" (unavailable), "Stream error" (error).

### Content removal

- **D-10:** Delete PassDetailsPanel.svelte entirely — all content is product-page filler ("Limited Quantity Available", "$0 USD", spec tables, "24/7 Video Access"). Nothing from this component survives. Button logic moves to the new sidebar layout.
- **D-11:** Keep TelemetryFooter.svelte as placeholder — leave it in place for now. Phase 3 will replace it with river conditions data. Avoids an empty spot at the bottom.
- **D-12:** Clean up LocalWeather copy — change "Local Telemetry" to something straightforward like "Current Weather". Remove "sensor array" and "Tillamook coast stations" jargon. Keep the weather data display as-is — just fix labels and descriptions.

### Agent's Discretion

- Exact branding description copy (agent writes it, guided by D-06 constraints)
- Weather component label rewording (guided by D-12 — "Current Weather" or similar)
- Sticky button implementation approach (CSS sticky vs absolute positioning)
- Transition animations for the new layout (existing fade transitions may need adjustment)
- How to handle the `sidebarWidth` derived state cleanup if it simplifies
- Mobile drawer max-height and overflow handling

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Sidebar components (primary targets)

- `packages/web/src/routes/+page.svelte` — Main page with sidebar conditional swap logic (lines 451-474), drawer container, width transitions. CRITICAL: Do NOT refactor stream state machine — change sidebar content/layout only.
- `packages/web/src/lib/components/PassDetailsPanel.svelte` — Component to DELETE. Contains all product-page filler content and the current stream button.
- `packages/web/src/lib/components/LocalWeather.svelte` — Weather component. Currently only shown during viewing phase. Becomes always visible. Copy cleanup needed (D-12).
- `packages/web/src/lib/components/TelemetryFooter.svelte` — Encoding/bitrate footer. Keep as-is (placeholder for Phase 3).

### Drawer primitives

- `packages/web/src/lib/components/ui/drawer/` — Drawer and DrawerContent components used for mobile bottom sheet and desktop sidebar.

### Styling

- `packages/web/src/app.css` — Tailwind v4 theme configuration, custom properties.

No external specs — requirements fully captured in decisions above and ROADMAP.md Phase 2 key context section.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `LocalWeather.svelte` — Self-contained weather component with own fetch/state. Reuse directly in the new always-visible layout. Only needs copy cleanup.
- `Drawer` / `DrawerContent` — Drawer primitives for responsive sidebar/drawer. Already handles bottom (mobile) and right (desktop) directions.
- `TelemetryFooter.svelte` — Kept as placeholder. No changes needed this phase.
- Stream button logic from `PassDetailsPanel.svelte` — the `ctaLabel` derived state, `buttonDisabled` logic, and button markup need to be extracted and placed in the new sidebar layout.

### Established Patterns

- Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`) throughout
- Tailwind CSS v4 utility classes with custom theme tokens (`text-primary`, `text-secondary`, `bg-light`, `border-sepia`, `font-display`, `tracking-label`, etc.)
- Component transitions using `svelte/transition` (`fade`, `fly`) with `cubicOut` easing
- Self-contained components that own their own data fetching (LocalWeather pattern)

### Integration Points

- `+page.svelte` lines 451-474 — the sidebar content area inside `<DrawerContent>`. This is where the conditional swap happens and where the new static layout replaces it.
- `+page.svelte` line 70 — `sidebarWidth` derived state. Keep dual-width behavior.
- `+page.svelte` lines 198-233 — `registerDemand` and `restartStream` functions. The new sidebar button needs to call these same functions.
- Stream phase state (`phase` variable in `+page.svelte`) — new button needs read access for labels/disabled states but does NOT modify the state machine.

</code_context>

<specifics>
## Specific Ideas

- Description should mention Steelhead and Chinook salmon runs but stay general — not everyone visiting is an angler
- Weather label changed from "Local Telemetry" to something plain like "Current Weather"
- The "Ad Interruptions: Only occasionally" joke in the specs table goes away with PassDetailsPanel deletion

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

Note: TelemetryFooter replacement with river conditions data is explicitly Phase 3 scope (FOOT-01).

</deferred>

---

_Phase: 02-sidebar-content-overhaul_
_Context gathered: 2026-04-10_
