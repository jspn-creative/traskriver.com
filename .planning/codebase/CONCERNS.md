# Codebase Concerns

**Analysis Date:** 2026-04-09

## Tech Debt

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

**Unauthenticated stream demand (POST):**

- Risk: `POST` on `packages/web/src/routes/api/stream/demand/+server.ts` updates KV without auth; anyone can signal demand and influence relay behavior (within throttle).
- Files: `packages/web/src/routes/api/stream/demand/+server.ts`
- Current mitigation: 30s throttle per key (`THROTTLE_MS`).
- Recommendations: Optional shared secret, Turnstile, or rate limit by IP at the edge if abuse matters.

**Dev-only debug endpoints:**

- Risk: `packages/web/src/routes/api/test-kv/+server.ts` returns 404 outside `dev`; ensure `dev` is never true in production builds.
- Files: `packages/web/src/routes/api/test-kv/+server.ts`
- Current mitigation: `if (!dev) throw error(404)`.
- Recommendations: Keep; verify deployment pipeline sets production mode.

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
- Environment note: Dev and production both depend on the same relay path, so KV demand/status pressure concerns apply to both unless namespaces/infrastructure are explicitly split.
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

## Test Coverage Gaps

**Web package:**

- What's not tested: Routes, Worker endpoints, Svelte components, and `stream.remote.ts`.
- Files: `packages/web/src/**` (no `*.test.ts` beside relay)
- Risk: Regressions in playback and APIs go unnoticed.
- Priority: Medium for critical paths.

**Relay package:**

- What's not tested: `packages/relay/src/poller.ts`, `packages/relay/src/ffmpeg.ts`, `packages/relay/src/status-reporter.ts`, `packages/relay/src/index.ts` integration.
- Files: Listed paths; only `packages/relay/src/state-machine.test.ts` exists.
- Risk: Poll or ffmpeg changes break production relay silently.
- Priority: Medium.

---

_Concerns audit: 2026-04-09_
