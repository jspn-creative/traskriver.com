# Phase 2: Counterscale CORS Fix - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix Counterscale analytics tracker requests from traskriver.com so they succeed without CORS errors. The integration code in `+layout.svelte` is correct — the issue is that the Counterscale Worker endpoint doesn't return CORS headers. This phase creates a proxy Worker that adds CORS headers and updates the client to use it.

</domain>

<decisions>
## Implementation Decisions

### CORS header strategy

- **D-01:** Use wildcard `Access-Control-Allow-Origin: *` — Counterscale is a public analytics endpoint with no cookies or auth. No reason to restrict origins.
- **D-02:** Handle both OPTIONS preflight requests and POST response headers — the tracker likely sends `Content-Type: application/json` which triggers CORS preflight in browsers.

### Fix location

- **D-03:** Create a wrapper/proxy Worker in this monorepo (new package, e.g., `packages/counterscale-proxy`) that proxies requests to the official Counterscale deploy at `counterscale.jspn.workers.dev` and injects CORS headers on responses.
- **D-04:** The official Counterscale Worker stays untouched — no fork, no modification.
- **D-05:** Update `reporterUrl` in `packages/web/src/routes/+layout.svelte` to point at the new wrapper Worker's URL instead of `counterscale.jspn.workers.dev/tracker`.

### Verification

- **D-06:** Verify with curl preflight test during development — send OPTIONS request with Origin header, confirm CORS headers are returned.
- **D-07:** Final verification via browser console check — open traskriver.com in Chrome DevTools, confirm no CORS errors for analytics requests in Network tab.

### the agent's Discretion

- Wrapper Worker naming and subdomain choice
- Wrangler configuration details for the proxy Worker
- Exact CORS header set beyond `Access-Control-Allow-Origin` (e.g., `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Counterscale integration

- `packages/web/src/routes/+layout.svelte` — Current Counterscale init code with `reporterUrl` that needs updating
- `.planning/REQUIREMENTS.md` — CORS-01 requirement definition

### Infrastructure

- `packages/web/wrangler.jsonc` — Reference for how Workers are configured in this project
- `.planning/codebase/INTEGRATIONS.md` — External service integration patterns

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `packages/web/wrangler.jsonc` — Reference wrangler config for Workers deployment patterns in this project
- Monorepo workspace setup with Turbo — new package follows existing `packages/*` convention

### Established Patterns

- Cloudflare Workers as deployment target — the proxy Worker follows the same platform
- Bun as package manager and runtime — new package uses Bun
- TypeScript for all application code

### Integration Points

- `packages/web/src/routes/+layout.svelte:16` — `reporterUrl` needs updating to the wrapper Worker URL
- The wrapper Worker proxies to `https://counterscale.jspn.workers.dev/tracker`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for the proxy Worker implementation.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 02-counterscale-cors-fix_
_Context gathered: 2026-04-13_
