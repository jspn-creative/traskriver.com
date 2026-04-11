# Phase 1: Analytics Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 01-Analytics Integration
**Areas discussed:** Tracker init approach, Environment gating

---

## Tracker Init Approach

| Option                         | Description                                                                                                                                   | Selected |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Programmatic in +layout.svelte | Import @counterscale/tracker in root layout, call init in $effect. Stays in SvelteKit lifecycle, easy to pass config, can conditionally load. | ✓        |
| Script tag in app.html         | Add a script tag directly to app.html. Simpler but outside SvelteKit control — harder to conditionally gate by environment.                   |          |
| You decide                     | Agent picks the best approach during implementation.                                                                                          |          |

**User's choice:** Programmatic in +layout.svelte (Recommended)
**Notes:** None — straightforward selection of recommended approach.

---

## Environment Gating

| Option          | Description                                                                                                                                        | Selected |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Production only | Only init tracker when running on traskriver.com. Dev and preview deployments don't pollute the dashboard. Check via $app/environment or hostname. | ✓        |
| Always on       | Track in all environments including dev. Useful to test full pipeline locally, but pollutes real data.                                             |          |
| You decide      | Agent picks a reasonable default during implementation.                                                                                            |          |

**User's choice:** Production only (Recommended)
**Notes:** None — straightforward selection of recommended approach.

---

## Agent's Discretion

- SPA navigation tracking — not selected for discussion, left to agent discretion. Will test `afterNavigate` as roadmap suggests.

## Deferred Ideas

- Custom engagement events deferred to ANLY-03 (v1.x) — Counterscale limitation, not a discussion outcome.
