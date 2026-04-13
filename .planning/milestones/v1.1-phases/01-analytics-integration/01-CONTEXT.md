# Phase 1: Analytics Integration - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Integrate the Counterscale analytics tracker into the SvelteKit web app so every page visit registers a pageview in the Counterscale dashboard. Counterscale is already deployed at `counterscale.jspn.workers.dev` — only the client-side tracker integration is needed. This phase has zero visual impact.

</domain>

<decisions>
## Implementation Decisions

### Tracker initialization

- **D-01:** Programmatic init in `+layout.svelte` — import `@counterscale/tracker` and call init inside an `$effect`. Do NOT use a script tag in `app.html`.
- **D-02:** Use `reporterUrl` config key pointing to `https://counterscale.jspn.workers.dev/tracker` (not `deploymentUrl` — npm README is wrong, source code uses `reporterUrl`)
- **D-03:** Install `@counterscale/tracker` (^3.4.1) as the only new dependency

### Environment gating

- **D-04:** Only init the tracker in production — do not track in dev or preview environments. Use hostname check or `$app/environment` to gate.
- **D-05:** Dev/preview deployments must not pollute the Counterscale dashboard with test traffic

### Agent's Discretion

- SPA navigation tracking approach — test whether `afterNavigate` manual calls are needed in SvelteKit or if the tracker handles client-side navigation automatically. Roadmap flags this as needing testing.
- Exact `$effect` placement and cleanup pattern in `+layout.svelte`
- Whether to use `$app/environment` `building`/`browser` checks vs hostname comparison for production gating

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Counterscale tracker

- `packages/web/src/routes/+layout.svelte` — Root layout where tracker init will be added
- `packages/web/src/app.html` — App shell (do NOT add script tags here — programmatic init decided)
- `packages/web/package.json` — Where `@counterscale/tracker` dependency will be added

### SvelteKit lifecycle

- `packages/web/svelte.config.js` — SvelteKit config with adapter-cloudflare and remoteFunctions
- `packages/web/src/app.d.ts` — Platform type definitions (for any env-related types)

No external specs — requirements fully captured in decisions above and ROADMAP.md key context section for Phase 1.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `+layout.svelte` (13 lines) — minimal root layout, clean insertion point for tracker init
- `LocalWeather.svelte` — established pattern of self-contained components that own their own fetch/state (pattern reference, not reusable for analytics)

### Established Patterns

- Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`) used throughout
- `$lib` alias for shared code under `packages/web/src/lib/`
- Tailwind CSS v4 for styling (not relevant here — zero visual impact)

### Integration Points

- `+layout.svelte` — tracker init goes here (runs on every page)
- `packages/web/package.json` — new dependency addition
- Cloudflare Workers runtime — tracker must be compatible (client-side only, no server-side concerns)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The ROADMAP.md key context section provides all implementation specifics:

- Counterscale deployed at `counterscale.jspn.workers.dev`
- Use `reporterUrl` not `deploymentUrl`
- `@counterscale/tracker` ^3.4.1
- Custom events NOT supported (Issue #200) — engagement tracking deferred to ANLY-03 (v1.x)
- Test SPA navigation tracking with `afterNavigate`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

Note: Custom engagement events (stream start, timeout, restart) are explicitly deferred to ANLY-03 (v1.x) per REQUIREMENTS.md — Counterscale doesn't support custom events.

</deferred>

---

_Phase: 01-analytics-integration_
_Context gathered: 2026-04-10_
