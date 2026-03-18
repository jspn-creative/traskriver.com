---
phase: 01-automated-auth-skip-paywall
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/routes/+page.server.ts
  - src/routes/+page.svelte
autonomous: true
requirements:
  - AUTH-01

must_haves:
  truths:
    - 'Visiting / with no cookies results in a valid `subscription` cookie being set on the response'
    - 'The VideoPlayer component renders immediately on page load — no paywall or conditional gate'
    - 'Revisiting with an existing valid cookie skips cookie creation (no redundant re-issue)'
    - 'data.streamUrl is always a non-null string returned by the server load function'
  artifacts:
    - path: 'src/routes/+page.server.ts'
      provides: 'Auto-auth load function that conditionally issues subscription cookie and always returns streamUrl'
      exports: ['load']
      contains: 'createSubscriptionCookie'
    - path: 'src/routes/+page.svelte'
      provides: 'Stream-first UI with no paywall conditional block'
      min_lines: 20
  key_links:
    - from: 'src/routes/+page.server.ts'
      to: 'src/lib/server/subscription.ts'
      via: 'createSubscriptionCookie() + hasActiveSubscription()'
      pattern: 'createSubscriptionCookie|hasActiveSubscription'
    - from: 'src/routes/+page.server.ts'
      to: 'browser cookies'
      via: "cookies.set('subscription', cookieValue, { path: '/' })"
      pattern: "cookies\\.set\\('subscription'"
    - from: 'src/routes/+page.svelte'
      to: 'data.streamUrl'
      via: 'unconditional <VideoPlayer src={data.streamUrl} />'
      pattern: 'VideoPlayer'
---

<objective>
Automatically authenticate every visitor to the site by issuing a valid HMAC-signed subscription
cookie in the SvelteKit server load function, and remove the paywall UI so the VideoPlayer renders
immediately for all users.

Purpose: AUTH-01 requires users to be automatically authenticated without completing a Stripe
purchase. This is a temporary measure while the full paywall is deferred to v2.

Output: Two modified files — `+page.server.ts` always returns a streamUrl and auto-issues a cookie,
`+page.svelte` unconditionally renders the VideoPlayer with no conditional paywall branch.
</objective>

<execution_context>
@/Users/jspn/Documents/Sites/river-stream/.opencode/get-shit-done/workflows/execute-plan.md
@/Users/jspn/Documents/Sites/river-stream/.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
</context>

<interfaces>
<!-- Key types and contracts the executor needs. Extracted from codebase. -->

From src/lib/server/subscription.ts:

```typescript
// Returns a base64url-encoded JSON payload signed with HMAC-SHA256.
// Format: `${base64urlPayload}.${base64urlSignature}`
// Payload: { active: true, expiresAt: number (ms timestamp, 30 days out) }
export const createSubscriptionCookie = async (): Promise<string>;

// Verifies the cookie string: checks signature + parses payload + checks active + expiry.
// Returns false if value is undefined, malformed, invalid signature, or expired.
export const hasActiveSubscription = async (value: string | undefined): Promise<boolean>;
```

From src/routes/+page.server.ts (current state — already implemented):

```typescript
import { hasActiveSubscription, createSubscriptionCookie } from '$lib/server/subscription';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const hasAccess = await hasActiveSubscription(cookies.get('subscription'));
	if (!hasAccess) {
		const cookieValue = await createSubscriptionCookie();
		cookies.set('subscription', cookieValue, { path: '/' });
	}
	return { streamUrl: '/stream/index.m3u8' };
};
```

From src/routes/+page.svelte (current state — already implemented):

```svelte
<script lang="ts">
	import VideoPlayer from '$lib/components/VideoPlayer.svelte';
	let { data } = $props<{ data: { streamUrl: string } }>();
</script>

<!-- VideoPlayer always rendered, no {#if data.streamUrl} block -->
<VideoPlayer src={data.streamUrl} />
```

</interfaces>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Auto-issue subscription cookie in server load function</name>
  <files>src/routes/+page.server.ts</files>
  <read_first>
    - src/routes/+page.server.ts
    - src/lib/server/subscription.ts
  </read_first>
  <action>
Modify `src/routes/+page.server.ts` to automatically authenticate unauthenticated visitors:

1. Import both `hasActiveSubscription` AND `createSubscriptionCookie` from `$lib/server/subscription`.
2. In the `load` function (receives `{ cookies }` from SvelteKit):
   - Call `const hasAccess = await hasActiveSubscription(cookies.get('subscription'))`.
   - If `hasAccess` is false:
     - Call `const cookieValue = await createSubscriptionCookie()`.
     - Set the cookie: `cookies.set('subscription', cookieValue, { path: '/' })`.
   - Always return `{ streamUrl: '/stream/index.m3u8' }` — never null, never conditional.

The cookie attributes `{ path: '/' }` are sufficient for this local POC. The `createSubscriptionCookie` function handles signing and sets `expiresAt` 30 days out internally.

Do NOT add `httpOnly`, `sameSite`, or `secure` attributes unless they are already present — this is a local dev POC.
</action>
<verify>
<automated>grep -n "createSubscriptionCookie\|hasActiveSubscription\|cookies.set\|streamUrl" src/routes/+page.server.ts</automated>
</verify>
<done> - `src/routes/+page.server.ts` imports `createSubscriptionCookie` from `$lib/server/subscription` - `cookies.set('subscription', cookieValue, { path: '/' })` appears in the file - The `load` function always returns `{ streamUrl: '/stream/index.m3u8' }` (no null branch)
</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Remove paywall UI — unconditionally render VideoPlayer</name>
  <files>src/routes/+page.svelte</files>
  <read_first>
    - src/routes/+page.svelte
    - src/routes/+page.server.ts
  </read_first>
  <action>
Modify `src/routes/+page.svelte` to remove all paywall-gated UI:

1. Update the `$props` type to `{ data: { streamUrl: string } }` (not `string | null`).
2. Remove any `{#if data.streamUrl}` / `{:else}` conditional blocks entirely.
3. Remove any `<form>` element that POSTs to `/api/test-access`.
4. Remove any "Purchase" / "Get access" / "Test access" button or link.
5. Render `<VideoPlayer src={data.streamUrl} />` unconditionally — it should always be present in the template.
6. Keep the "Access active" / "Live feed unlocked" status card if it exists.
7. The page layout should be stream-first: VideoPlayer visible immediately on load.

If any of these elements are already absent (because the phase was already implemented), verify and confirm — do not re-add them.
</action>
<verify>
<automated>grep -c "#if data.streamUrl\|/api/test-access\|streamUrl | null" src/routes/+page.svelte || echo "0 matches (correct)"</automated>
</verify>
<done> - `src/routes/+page.svelte` contains no `{#if data.streamUrl}` blocks - `src/routes/+page.svelte` contains no `<form>` posting to `/api/test-access` - `data` prop is typed as `{ streamUrl: string }` (not nullable) - `<VideoPlayer src={data.streamUrl} />` is present unconditionally
</done>
</task>

</tasks>

<verification>
After both tasks complete, verify the full flow:

1. `npm run dev` starts without TypeScript errors
2. Visit `http://localhost:5173` — VideoPlayer renders immediately
3. Browser DevTools → Application → Cookies: a `subscription` cookie exists
4. Delete the cookie and reload — a new `subscription` cookie is issued and VideoPlayer still renders
5. No paywall UI, no "Purchase" or "Test access" buttons visible

Automated structural checks:

```bash
# Task 1: server load always returns streamUrl and imports both functions
grep "createSubscriptionCookie\|hasActiveSubscription" src/routes/+page.server.ts
grep "streamUrl.*index.m3u8" src/routes/+page.server.ts

# Task 2: no paywall conditional in template
grep -c "#if data.streamUrl" src/routes/+page.svelte  # should be 0
grep "VideoPlayer" src/routes/+page.svelte             # should exist
```

</verification>

<success_criteria>

- AUTH-01 satisfied: Users automatically receive a valid HMAC-signed subscription cookie on first visit
- VideoPlayer renders on page load for all users — no paywall gate
- Existing valid cookies are respected (no redundant re-issue)
- No TypeScript errors (`npm run build` or `npm run check` passes)
- Source matches the implementation contract from `src/lib/server/subscription.ts`
  </success_criteria>

<output>
After completion, create `.planning/phases/01-automated-auth-skip-paywall/01-01-SUMMARY.md`
</output>
