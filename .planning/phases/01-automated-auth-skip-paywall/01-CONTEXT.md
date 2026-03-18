# Phase 1: Automated Auth (Skip Paywall) - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Temporarily authenticate users automatically. Automatically issue valid session cookies to view the stream, skipping the paywall.

</domain>

<decisions>
## Implementation Decisions

### Authentication Trigger

- Issue the authentication cookie automatically when the user visits the site, instead of requiring a button click or `/api/test-access` POST.
- The `load` function in `src/routes/+page.server.ts` should check for an active subscription, and if none exists, generate and set a valid cookie using `createSubscriptionCookie()` from `src/lib/server/subscription.ts`.

### UI Changes

- The marketing/paywall copy and "Purchase/Test" options on the homepage (`src/routes/+page.svelte`) should be removed or hidden since access is granted immediately.
- The video player should be shown to all users immediately upon visiting.

### Existing Endpoints

- Leave `/api/stripe/checkout` and `/api/stripe/success` as they are, but they won't be linked from the UI anymore.

### Claude's Discretion

- Exactly how to rearrange the `src/routes/+page.svelte` UI to be stream-first.
- Whether to keep the `/api/test-access` endpoint for testing purposes or remove it.

</decisions>

<canonical_refs>

## Canonical References

No external specs — requirements are fully captured in decisions above

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `createSubscriptionCookie()` in `src/lib/server/subscription.ts`: Use this to generate the cookie payload in `src/routes/+page.server.ts`.
- `hasActiveSubscription()` in `src/lib/server/subscription.ts`: Continues to be used to verify access before granting the stream URL.

### Integration Points

- `src/routes/+page.server.ts`: This is where the automatic authentication logic must be injected. Since SvelteKit `load` functions receive a `cookies` object, it can directly set the cookie if `hasActiveSubscription` returns false.
- `src/routes/+page.svelte`: Needs updating to remove the paywall state and default to showing the stream (since the server loader will guarantee a valid `streamUrl` is returned).

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 01-automated-auth-skip-paywall_
_Context gathered: 2026-03-18_
