# Phase 1: Automated Auth (Skip Paywall) - Research

## Objective

Research how to automatically authenticate users and issue a session cookie without requiring the paywall.

## Current State

- `src/routes/+page.server.ts` checks `hasActiveSubscription(cookies.get('subscription'))`.
- If true, it returns `streamUrl: '/stream/index.m3u8'`, otherwise `null`.
- `src/routes/+page.svelte` has an `#if data.streamUrl` condition. If true, it shows the player. If false, it shows a button to POST to `/api/test-access`.
- `src/lib/server/subscription.ts` exports `createSubscriptionCookie()` and `hasActiveSubscription()`.

## Implementation Path

1. **Update `+page.server.ts`**:
   - Check `hasActiveSubscription(cookies.get('subscription'))`.
   - If `false`, call `createSubscriptionCookie()`.
   - Set the cookie using `cookies.set('subscription', cookieValue, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 })`. (Or let `createSubscriptionCookie` handle attributes, but it just returns the value).
   - Ensure `streamUrl` is always returned.
2. **Update `+page.svelte`**:
   - Remove the `#if data.streamUrl` check and the `{:else}` block.
   - The player should always render.

## Validation Architecture

- **Automatic Auth**: Visit `/` with no cookies -> receive a valid `subscription` cookie -> `data.streamUrl` is present.
- **UI State**: The paywall UI is completely hidden and the VideoPlayer renders immediately.

## RESEARCH COMPLETE
