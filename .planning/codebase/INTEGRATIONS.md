# External Integrations

**Analysis Date:** 2026-04-09

## APIs & External Services

**Video / CDN:**

- Cloudflare Stream — live HLS playback URLs built from customer subdomain and signed JWT (`packages/web/src/routes/stream.remote.ts`).
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

**End users:**

- Stream viewing is public — no paywall or account gate in the web app.

**Relay ↔ API:**

- Bearer token: `RELAY_API_TOKEN` on Worker platform env (`packages/web/src/app.d.ts`); relay sends `Authorization: Bearer …` (`packages/relay` poller/status reporter — see `packages/relay/src/poller.ts` / shared `RelayConfig.bearerToken` from `RELAY_BEARER_TOKEN`).

## Monitoring & Observability

**Error Tracking:**

- No Sentry/Rollbar SDK detected in `package.json` dependencies.

**Logs:**

- `console.log` / `console.warn` in API routes (e.g. KV failures).

- Wrangler `observability.enabled: true` in `packages/web/wrangler.jsonc`.

- Relay structured logging via `packages/relay/src/logger.ts`.

## CI/CD & Deployment

**Hosting:**

- Web: Cloudflare Workers (`wrangler deploy` / `packages/web` scripts).

- Relay: self-hosted (systemd on device (on-site Raspberry Pi), git pull + configure in `packages/relay/scripts/configure.ts`).

**CI Pipeline:**

- `.github/workflows/deploy-relay.yml` — on push to `main` for `packages/relay/**` and `packages/shared/**`, Tailscale + SSH to run `configure.ts` on remote host.

- Automatic web deploy to Cloudflare on push for all branches. (Also able to deploy via local/operator `bun run deploy` from root `package.json` when testing a build).

## Environment Configuration

**Required env vars (representative):**

- Web (Worker + SvelteKit private): Cloudflare Stream fields above; platform `RELAY_API_TOKEN`; optional `DEMAND_WINDOW_SECONDS`.

- Relay: `STREAM_URL`, `RTSP_URL`, `RELAY_BEARER_TOKEN`; URLs defaulting to localhost web API for demand/status (`packages/relay/src/index.ts`).

- Scripts: `CF_STREAM_*` for signing setup; `CAMERA_RTSP_URL` / `CF_STREAM_LIVE_INPUT_KEY` for push script.

**Secrets location:**

- Not in repo — use Cloudflare dashboard/Wrangler secrets for Workers; `.env` on relay host per `configure.ts` (existence check only).

## Webhooks & Callbacks

**Incoming:**

- None.

**Outgoing:**

- Relay calls HTTP GET `DEMAND_API_URL` and POST `STATUS_API_URL` (defaults under `packages/relay/src/index.ts`).

---

_Integration audit: 2026-04-09_
