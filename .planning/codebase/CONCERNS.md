# Codebase Concerns

**Analysis Date:** 2026-04-09

## Tech Debt

**Automatic “subscription” grant on every page load:**

- Issue: `load` in `packages/web/src/routes/+page.server.ts` calls `createSubscriptionCookie()` and sets `subscription` whenever `hasActiveSubscription` is false, so any visitor receives a valid signed cookie without Stripe or payment.
- Files: `packages/web/src/routes/+page.server.ts`, `packages/web/src/lib/server/subscription.ts`
- Impact: Paywalled access is effectively disabled; Stripe checkout and success flow are redundant for obtaining stream access.
- Fix approach: Only set subscription cookies after verified payment (e.g. `packages/web/src/routes/api/stripe/success/+server.ts`) or explicit admin; remove or gate auto-grant behind `dev` / feature flag.

**Same pattern in stream remote function:**

- Issue: `getStreamInfo` in `packages/web/src/routes/stream.remote.ts` also mints and sets a subscription cookie when access is missing, duplicating the bypass.
- Files: `packages/web/src/routes/stream.remote.ts`
- Impact: Server functions reinforce open access even if layout load is fixed later.
- Fix approach: Return 403 or redirect to checkout when `!hasAccess`; do not call `createSubscriptionCookie()` here.

**Duplicate / debug stream remote module:**

- Issue: `packages/web/src/routes/stream.copy.remote.ts` duplicates JWT and stream URL logic from `stream.remote.ts`, logs path and token metadata to the console, and returns `{ token, customerCode, inputId }` in addition to `liveHlsUrl`. Nothing in the repo imports this file (dead path).
- Files: `packages/web/src/routes/stream.copy.remote.ts`, `packages/web/src/routes/stream.remote.ts`
- Impact: Drift risk; debug logs and expanded return shape are unsafe if the copy is ever wired to the UI.
- Fix approach: Delete the copy or merge into one module; strip debug logging; never return raw signing tokens to the client unless required and audited.

**Stripe webhook does not drive subscription state:**

- Issue: `packages/web/src/routes/api/stripe/webhook/+server.ts` only logs `checkout.session.completed` and unhandled events; no persistence, no cookie issuance, no sync with `hasActiveSubscription`.
- Files: `packages/web/src/routes/api/stripe/webhook/+server.ts`, `packages/web/src/lib/server/stripe.ts`
- Impact: Webhook confirms delivery to Stripe but does not enforce or reconcile entitlements; operational confusion if you rely on webhooks for truth.
- Fix approach: Define a single source of truth (KV, D1, Stripe metadata) and update webhook handlers to match cookie or session issuance.

**JWT / base64 helpers duplicated:**

- Issue: `generateStreamToken`, `toBase64Url`, and similar appear in both `stream.remote.ts` and `stream.copy.remote.ts`.
- Files: `packages/web/src/routes/stream.remote.ts`, `packages/web/src/routes/stream.copy.remote.ts`
- Impact: Changes to signing or claims must be applied in multiple places.
- Fix approach: Move shared crypto helpers to `packages/web/src/lib/server/` (or `packages/shared/` if both sides need types only).

**Monolithic home route component:**

- Issue: `packages/web/src/routes/+page.svelte` is large (~480 lines) and combines relay polling, demand registration, drawer/layout, and video lifecycle.
- Files: `packages/web/src/routes/+page.svelte`
- Impact: Harder to test and change without regressions.
- Fix approach: Extract hooks or child components (e.g. relay poller, demand registration) while keeping one orchestration entry.

**Relay KV comment accuracy:**

- Issue: `packages/relay/src/index.ts` contains a long comment about KV write limits and heartbeat math; the note mixes daily limits with per-minute estimates and may confuse future maintainers.
- Files: `packages/relay/src/index.ts`
- Impact: Misconfiguration if someone trusts the comment over Cloudflare docs.
- Fix approach: Replace with a short pointer to Wrangler/KV quotas and measured numbers from production.

## Known Bugs

**Not separately tracked:** No `TODO` / `FIXME` / `HACK` markers were found in application source (`*.ts`, `*.svelte`).

**Viewer count console noise:**

- Symptoms: Browser console logs viewer counts on every successful poll.
- Files: `packages/web/src/lib/components/LiveViewerCount.svelte`
- Trigger: Active session with successful `/views` fetch.
- Workaround: Remove or guard `console.log` with `dev` only.

## Security Considerations

**Default cookie signing secret:**

- Risk: If `COOKIE_SECRET` is unset, `packages/web/src/lib/server/subscription.ts` uses a fixed default string (`river-stream-local-dev-secret`), so HMAC keys are predictable in misconfigured deployments.
- Files: `packages/web/src/lib/server/subscription.ts`
- Current mitigation: None beyond “set env in production.”
- Recommendations: Fail fast in production when `COOKIE_SECRET` is missing; keep default only for local dev.

**Unauthenticated stream demand (POST):**

- Risk: `POST` on `packages/web/src/routes/api/stream/demand/+server.ts` updates KV without auth; anyone can signal demand and influence relay behavior (within throttle).
- Files: `packages/web/src/routes/api/stream/demand/+server.ts`
- Current mitigation: 30s throttle per key (`THROTTLE_MS`).
- Recommendations: Optional shared secret, Turnstile, or rate limit by IP at the edge if abuse matters.

**Dev-only debug endpoints:**

- Risk: `packages/web/src/routes/api/test-access/+server.ts` and `packages/web/src/routes/api/test-kv/+server.ts` return 404 outside `dev`; ensure `dev` is never true in production builds.
- Files: `packages/web/src/routes/api/test-access/+server.ts`, `packages/web/src/routes/api/test-kv/+server.ts`
- Current mitigation: `if (!dev) throw error(404)`.
- Recommendations: Keep; verify deployment pipeline sets production mode.

**Signed stream token exposure to client:**

- Risk: HLS URL includes a short-lived JWT; `LiveViewerCount` also calls `https://customer-${customerCode}.cloudflarestream.com/${token}/views` from the browser, so the token appears in DevTools and memory. Expected for client playback but increases leakage surface if copied.
- Files: `packages/web/src/lib/components/LiveViewerCount.svelte`, `packages/web/src/routes/stream.remote.ts`
- Current mitigation: Token expiry (1h in `stream.remote.ts`).
- Recommendations: Accept for public live; restrict embedding or shorten TTL if needed.

**Committed Wrangler account identifier:**

- Risk: `packages/web/wrangler.jsonc` includes `account_id` (and KV namespace ids). Not a secret, but ties repo to a specific Cloudflare account.
- Files: `packages/web/wrangler.jsonc`
- Current mitigation: Public IDs only.
- Recommendations: Use env-specific config or secrets management if forks must not share infra.

## Performance Bottlenecks

**Cloudflare KV write limits:**

- Problem: `packages/web/src/routes/api/stream/demand/+server.ts` and `packages/web/src/routes/api/relay/status/+server.ts` catch errors when `kv.put` fails (e.g. free-tier daily write cap). Relay and demand then degrade silently aside from logs.
- Files: `packages/web/src/routes/api/stream/demand/+server.ts`, `packages/web/src/routes/api/relay/status/+server.ts`, `packages/relay/src/status-reporter.ts`
- Cause: Worker KV quota and best-effort error handling.
- Improvement path: Paid KV tier, batching, or reducing heartbeat frequency; alert on repeated `kv.put` failures.

**Large generated typings in repo:**

- Problem: `packages/web/worker-configuration.d.ts` is very large (Wrangler-generated); adds noise to search and reviews.
- Files: `packages/web/worker-configuration.d.ts`, `packages/web/package.json` (`gen` script)
- Cause: Checked-in generated types.
- Improvement path: Regenerate in CI or gitignore if policy allows; document regeneration in team workflow.

**Home page bundle / complexity:**

- Problem: `+page.svelte` coordinates many effects (polling, intervals, relay state machine alignment), increasing main-thread work and bug risk.
- Files: `packages/web/src/routes/+page.svelte`
- Cause: Feature accumulation in one view.
- Improvement path: Split effects; consider single `requestAnimationFrame` or consolidated poll loop.

## Fragile Areas

**Video player + HLS + Cloudflare Stream edge behavior:**

- Files: `packages/web/src/lib/components/VideoPlayer.svelte`
- Why fragile: Depends on vidstack/HLS.js behavior, 204/manifest edge cases, cache-busting via `playerKey`, and multiple `any`-typed event handlers; regressions are easy when upgrading `vidstack` or browsers.
- Safe modification: Run manual playback tests after dependency bumps; preserve cache-bust and `xhrSetup` behavior documented in-file.
- Test coverage: No automated tests for this component.

**Relay process lifecycle:**

- Files: `packages/relay/src/index.ts`, `packages/relay/src/ffmpeg.ts`, `packages/relay/src/state-machine.ts`
- Why fragile: Bun `spawn`, stderr streaming, timers, and state machine transitions interact; exit during `liveConfirmMs` window triggers cooldown paths.
- Safe modification: Only change `FfmpegManager` and tick ordering with `packages/relay/src/state-machine.test.ts` expanded or manual soak tests.
- Test coverage: `packages/relay/src/state-machine.test.ts` only covers the state machine, not ffmpeg or HTTP polling.

## Scaling Limits

**KV-backed demand and status:**

- Current capacity: Single keys (`stream-demand`, `relay-status`) in `RIVER_KV`; relay polls and heartbeats add write load.
- Limit: Cloudflare KV daily/monthly operations and size per value.
- Scaling path: Dedicated namespace per environment, paid plan, or move hot paths to Durable Objects if strong consistency is needed.

**Single relay instance assumption:**

- Current capacity: One logical relay writing status to one KV key.
- Limit: No coordination for multiple relays in `packages/relay` without key partitioning.
- Scaling path: Per-relay keys in KV and UI aggregation, or queue-based control plane.

## Dependencies at Risk

**vidstack:**

- Risk: Player integration is custom and version-sensitive (`packages/web/package.json` / `vidstack`).
- Impact: Upgrades may break HLS config hooks in `VideoPlayer.svelte`.
- Migration plan: Pin versions; read changelog before bumping; test live and offline manifest paths.

**Stripe API major version:**

- Risk: `stripe` is pinned to a major range in `packages/web/package.json`; breaking API changes on major upgrades.
- Impact: Checkout, webhook, and session retrieval in `packages/web/src/routes/api/stripe/*` may need updates.
- Migration plan: Follow Stripe migration guides per major release.

## Missing Critical Features

**End-to-end paid access enforcement:**

- Problem: Automatic cookie issuance (see Tech Debt) means “subscription” does not map to Stripe subscription state for normal visits.
- Blocks: Real monetization and access control.

**Webhook-driven entitlement sync:**

- Problem: No linkage between Stripe subscription lifecycle (cancel, fail, renew) and `hasActiveSubscription`.
- Blocks: Accurate revocation when payment fails.

## Test Coverage Gaps

**Web package:**

- What's not tested: Routes, `subscription.ts`, Stripe handlers, Worker endpoints, Svelte components, and `stream.remote.ts`.
- Files: `packages/web/src/**` (no `*.test.ts` beside relay)
- Risk: Regressions in access control and payments go unnoticed.
- Priority: High for subscription and Stripe paths.

**Relay package:**

- What's not tested: `packages/relay/src/poller.ts`, `packages/relay/src/ffmpeg.ts`, `packages/relay/src/status-reporter.ts`, `packages/relay/src/index.ts` integration.
- Files: Listed paths; only `packages/relay/src/state-machine.test.ts` exists.
- Risk: Poll or ffmpeg changes break production relay silently.
- Priority: Medium.

---

*Concerns audit: 2026-04-09*
