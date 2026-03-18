# External Integrations

**Analysis Date:** 2026-03-18

## APIs & External Services

**Payments & Subscriptions:**

- Stripe - Processing payments, managing subscriptions, and handling checkout sessions (`src/lib/server/stripe.ts`)
  - SDK/Client: `stripe`
  - Auth: `STRIPE_SECRET_KEY`

**External Data Sources:**

- RTSP Camera - Providing live video feed (`scripts/stream.ts`)
  - SDK/Client: `ffmpeg` (spawned via `Bun.spawn`)
  - Auth: Embedded in `CAMERA_RTSP_URL`

## Data Storage

**Databases:**

- None detected
  - Connection: Not applicable
  - Client: Not applicable

**File Storage:**

- Local filesystem only - `scripts/stream.ts` writes HLS chunks to `static/stream/`

**Caching:**

- None detected

## Authentication & Identity

**Auth Provider:**

- Custom - Stateless cryptographically signed cookies via Web Crypto API (`src/lib/server/subscription.ts`)
  - Implementation: After a successful Stripe checkout (`src/routes/api/stripe/success/+server.ts`), an HMAC SHA-256 signed cookie is created to grant 30-day access

## Monitoring & Observability

**Error Tracking:**

- None detected

**Logs:**

- `console.log` and `console.error` used directly (e.g., in `src/routes/api/stripe/webhook/+server.ts`)

## CI/CD & Deployment

**Hosting:**

- Cloudflare Workers/Pages (`wrangler.jsonc`)

**CI Pipeline:**

- None detected

## Environment Configuration

**Required env vars:**

- `CAMERA_RTSP_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID`
- `COOKIE_SECRET`

**Secrets location:**

- Local `.env` file (ignored by git) and Cloudflare environment variables in production

## Webhooks & Callbacks

**Incoming:**

- `POST /api/stripe/webhook` - Listens for Stripe events like `checkout.session.completed` (`src/routes/api/stripe/webhook/+server.ts`)

**Outgoing:**

- None detected

---

_Integration audit: 2026-03-18_
