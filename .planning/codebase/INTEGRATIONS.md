# External Integrations

**Analysis Date:** 2026-04-09

## APIs & External Services

**Payments:**

- Stripe — subscription checkout and webhook verification.

  - SDK: `stripe` (`packages/web/src/lib/server/stripe.ts`).

  - Server routes: `packages/web/src/routes/api/stripe/checkout/+server.ts`, `packages/web/src/routes/api/stripe/webhook/+server.ts`, `packages/web/src/routes/api/stripe/success/+server.ts`.

  - Env (private): `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` (see `getStripeWebhookSecret()` usage in `packages/web/src/routes/api/stripe/webhook/+server.ts`).

**Video / CDN:**

- Cloudflare Stream — live HLS playback URLs built from customer subdomain and signed JWT (`packages/web/src/routes/stream.remote.ts`, `packages/web/src/routes/stream.copy.remote.ts`).

  - Env (private): `CF_STREAM_CUSTOMER_CODE`, `CF_STREAM_LIVE_INPUT_UID`, `CF_STREAM_SIGNING_KEY_ID`, `CF_STREAM_SIGNING_JWK`.

- Cloudflare Stream REST API — create signing keys (`packages/web/scripts/setup-signing.ts` uses `https://api.cloudflare.com/client/v4/accounts/{accountId}/stream/keys`).

  - Env for script: `CF_STREAM_ACCOUNT_ID`, `CF_STREAM_API_TOKEN` (`packages/web/scripts/setup-signing.ts`).

- RTMPS ingest — `scripts/push-stream.ts` pushes FFmpeg output to `rtmps://live.cloudflare.com:443/live/{liveInputKey}`.

  - Env: `CAMERA_RTSP_URL`, `CF_STREAM_LIVE_INPUT_KEY`.

**Networking / Ops:**

- Tailscale — GitHub Actions uses `tailscale/github-action@v3` to reach relay host over SSH (`.github/workflows/deploy-relay.yml`).

  - Secrets (CI): `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`, `RELAY_TAILSCALE_HOSTNAME` (names only; values not in repo).

## Data Storage

**Databases:**

- None as SQL/NoSQL — application state for streaming demand and relay status uses Cloudflare KV.

**KV:**

- Cloudflare KV — binding `RIVER_KV` (`packages/web/wrangler.jsonc`, `packages/web/src/app.d.ts`).

  - Keys: `stream-demand` (demand signal) in `packages/web/src/routes/api/stream/demand/+server.ts`; `relay-status` in `packages/web/src/routes/api/relay/status/+server.ts`.

**File Storage:**

- Static assets via SvelteKit/`ASSETS` binding in Wrangler config; no separate object-storage SDK detected.

**Caching:**

- KV TTL and in-code throttling (e.g. demand POST throttle in `packages/web/src/routes/api/stream/demand/+server.ts`).

## Authentication & Identity

**Auth Provider:**

- No OAuth/social login in tree — access to stream UI gated by signed subscription cookie (`packages/web/src/lib/server/subscription.ts`).

- Stripe Checkout establishes paid flow; cookie is HMAC-signed payload (`COOKIE_SECRET` via `$env/dynamic/private`, fallback string for local dev in `packages/web/src/lib/server/subscription.ts`).

**Relay ↔ API:**

- Bearer token: `RELAY_API_TOKEN` on Worker platform env (`packages/web/src/app.d.ts`); relay sends `Authorization: Bearer …` (`packages/relay` poller/status reporter — see `packages/relay/src/poller.ts` / shared `RelayConfig.bearerToken` from `RELAY_BEARER_TOKEN`).

## Monitoring & Observability

**Error Tracking:**

- No Sentry/Rollbar SDK detected in `package.json` dependencies.

**Logs:**

- `console.log` / `console.warn` in API routes (e.g. Stripe webhook, KV failures).

- Wrangler `observability.enabled: true` in `packages/web/wrangler.jsonc`.

- Relay structured logging via `packages/relay/src/logger.ts`.

## CI/CD & Deployment

**Hosting:**

- Web: Cloudflare Workers (`wrangler deploy` / `packages/web` scripts).

- Relay: self-hosted (systemd on device, git pull + configure in `packages/relay/scripts/configure.ts`).

**CI Pipeline:**

- `.github/workflows/deploy-relay.yml` — on push to `main` for `packages/relay/**` and `packages/shared/**`, Tailscale + SSH to run `configure.ts` on remote host.

- No separate workflow detected for automatic web deploy to Cloudflare (deploy via local/operator `bun run deploy` from root `package.json`).

## Environment Configuration

**Required env vars (representative):**

- Web (Worker + SvelteKit private): Stripe keys/price/webhook secret; Cloudflare Stream fields above; `COOKIE_SECRET`; platform `RELAY_API_TOKEN`; optional `DEMAND_WINDOW_SECONDS`.

- Relay: `STREAM_URL`, `RTSP_URL`, `RELAY_BEARER_TOKEN`; URLs defaulting to localhost web API for demand/status (`packages/relay/src/index.ts`).

- Scripts: `CF_STREAM_*` for signing setup; `CAMERA_RTSP_URL` / `CF_STREAM_LIVE_INPUT_KEY` for push script.

**Secrets location:**

- Not in repo — use Cloudflare dashboard/Wrangler secrets for Workers; `.env` on relay host per `configure.ts` (existence check only).

## Webhooks & Callbacks

**Incoming:**

- `POST /api/stripe/webhook` — Stripe signature verification (`packages/web/src/routes/api/stripe/webhook/+server.ts`).

**Outgoing:**

- Relay calls HTTP GET `DEMAND_API_URL` and POST `STATUS_API_URL` (defaults under `packages/relay/src/index.ts`) — no third-party webhook subscriptions detected beyond Stripe.

---

*Integration audit: 2026-04-09*
