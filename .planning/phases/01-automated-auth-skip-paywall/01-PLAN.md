---
wave: 1
depends_on: []
files_modified:
  - src/routes/+page.server.ts
  - src/routes/+page.svelte
autonomous: true
requirements:
  - AUTH-01
---

# Plan 01 - Automated Authentication

## Goal

Implement automatic user authentication to skip the paywall and always show the stream.

## Requirements Covered

- AUTH-01: The application automatically authenticates users (skipping the paywall) and issues valid session cookies to view the stream.

## Tasks

<task>
<description>Update `+page.server.ts` to automatically issue session cookies for unauthenticated users.</description>
<read_first>
- `src/routes/+page.server.ts`
- `src/lib/server/subscription.ts`
</read_first>
<action>
Modify `src/routes/+page.server.ts`.
Import `createSubscriptionCookie` alongside `hasActiveSubscription` from `$lib/server/subscription`.
In the `load` function, if `hasAccess` is false, call `await createSubscriptionCookie()` to generate a new token.
Set the cookie using `cookies.set('subscription', cookieValue, { path: '/' })`.
Ensure the function always returns `{ streamUrl: '/stream/index.m3u8' }`.
</action>
<acceptance_criteria>
- `src/routes/+page.server.ts` imports `createSubscriptionCookie`.
- `cookies.set('subscription', ...)` is called when `hasAccess` is false.
- The `load` function always returns a non-null `streamUrl` of `'/stream/index.m3u8'`.
</acceptance_criteria>
</task>

<task>
<description>Update `+page.svelte` to remove the paywall UI and unconditionally render the video player.</description>
<read_first>
- `src/routes/+page.svelte`
- `src/routes/+page.server.ts`
</read_first>
<action>
Modify `src/routes/+page.svelte`.
Since `data.streamUrl` is now unconditionally returned as a string, remove the `{#if data.streamUrl}` and `{:else}` conditional blocks.
Keep the `<VideoPlayer>` component and the "Live feed unlocked" status box.
Completely remove the "View the test feed" / paywall section, including the `<form>` posting to `/api/test-access`.
Update the `data` prop type to `{ streamUrl: string }` instead of `{ streamUrl: string | null }`.
</action>
<acceptance_criteria>
- `src/routes/+page.svelte` no longer contains `#if data.streamUrl` blocks.
- `src/routes/+page.svelte` no longer contains the `<form>` POST to `/api/test-access`.
- The `data` prop is typed as `{ streamUrl: string }`.
</acceptance_criteria>
</task>

## Verification

- Start the app with `npm run dev`.
- Visit `http://localhost:5173`.
- Verify the VideoPlayer is visible on load.
- Ensure the browser receives a `subscription` cookie in the DevTools Application tab.
- Refresh the page and ensure it still loads properly and `hasActiveSubscription` validates the existing cookie (avoids resetting it again).

## Must Haves

- The user must seamlessly receive access without manual interaction.
- The paywall UI must be entirely removed from the root route.
- The `subscription` cookie must be correctly signed and set on the response.
