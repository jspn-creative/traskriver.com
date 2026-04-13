# Phase 2: Counterscale CORS Fix - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 02-counterscale-cors-fix
**Areas discussed:** CORS header strategy, Where to apply the fix, Verification approach

---

## CORS Header Strategy

| Option                | Description                                                                                                                      | Selected |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Wildcard (\*)         | Simplest. Counterscale is a public analytics endpoint — no cookies/auth involved. No maintenance when domains change.            | ✓        |
| Specific origins only | Return https://traskriver.com and https://www.traskriver.com only. More restrictive but requires updating if you add more sites. |          |
| You decide            | Agent picks the approach during planning                                                                                         |          |

**User's choice:** Wildcard (\*)
**Notes:** Public analytics endpoint, no reason to restrict.

| Option                      | Description                                                                                                   | Selected |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- | -------- |
| Both OPTIONS + POST headers | Handles preflight properly. The tracker likely sends Content-Type: application/json which triggers preflight. | ✓        |
| POST headers only           | Simpler, but may fail if browser sends OPTIONS preflight first.                                               |          |
| You decide                  | Agent determines based on what the tracker actually sends                                                     |          |

**User's choice:** Both OPTIONS + POST headers
**Notes:** None

---

## Where to Apply the Fix

| Option                     | Description                                                                                                                             | Selected |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Fork and patch             | Fork the Counterscale repo, add CORS headers to the Worker fetch handler, deploy your fork.                                             |          |
| Cloudflare Transform Rules | Use Cloudflare dashboard to add response headers via Transform Rules. No code changes, but config lives outside version control.        |          |
| Wrapper Worker             | Create a new Worker that proxies requests to Counterscale and injects CORS headers. More moving parts but keeps Counterscale untouched. | ✓        |

**User's choice:** Wrapper Worker
**Notes:** Keeps Counterscale untouched.

| Option        | Description                                                                                                                                  | Selected |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| In this repo  | New package or directory in the monorepo (e.g., packages/counterscale-proxy). Version controlled, deployable alongside other infrastructure. | ✓        |
| Separate repo | Standalone repo for the wrapper Worker. Independent deploy lifecycle.                                                                        |          |
| You decide    | Agent picks the best location during planning                                                                                                |          |

**User's choice:** In this repo
**Notes:** Follows monorepo convention.

---

## Verification Approach

| Option                | Description                                                                                                                     | Selected |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Browser console check | Open traskriver.com in Chrome DevTools, confirm no CORS errors for counterscale requests in Network tab. Manual but definitive. |          |
| curl preflight test   | Run curl with Origin header against the wrapper Worker to verify CORS headers are returned. Scriptable, can run in CI.          |          |
| Both                  | curl test for quick iteration during dev, browser check as final confirmation on production.                                    | ✓        |

**User's choice:** Both
**Notes:** curl during dev, browser check as final production confirmation.

| Option                      | Description                                                                                                | Selected |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| Yes, new Worker URL         | The wrapper Worker will have its own route/subdomain. Update reporterUrl in +layout.svelte to point to it. | ✓        |
| Same URL, different routing | Keep counterscale.jspn.workers.dev but route it through the wrapper. No client code change needed.         |          |
| You decide                  | Agent determines the cleanest approach during planning                                                     |          |

**User's choice:** Yes, new Worker URL
**Notes:** Client code updated to point at wrapper.

---

## the agent's Discretion

- Wrapper Worker naming and subdomain choice
- Wrangler configuration details for the proxy Worker
- Exact CORS header set beyond Access-Control-Allow-Origin

## Deferred Ideas

None — discussion stayed within phase scope.
