# River Stream

## What This Is

A website with an "always on" livestream video feed (like a 24/7 nature camera) available behind a paywall. The current implementation uses Cloudflare Workers, SvelteKit, and a background process to transcode an RTSP feed to HLS.

## Core Value

Reliably deliver a continuous, high-quality livestream to authenticated users.

## Requirements

### Validated

- ✓ Play HLS video stream using Vidstack (`src/lib/components/VideoPlayer.svelte`) — existing
- ✓ Convert RTSP stream to static HLS segments locally (`scripts/stream.ts`) — existing
- ✓ Basic stateless cookie-based authentication via HMAC SHA-256 (`src/lib/server/subscription.ts`) — existing
- ✓ Stripe Checkout integration for purchasing access (`src/routes/api/stripe/checkout/+server.ts`) — existing

### Active

- [ ] Authenticate users automatically (skip the paywall step for now, as the client hasn't decided on the payment model).
- [ ] Fix the deployment model so the app can run on Cloudflare Workers/Pages (currently it writes HLS files to the local file system, which breaks in a serverless environment).
- [ ] Secure the HLS stream assets so they cannot be accessed directly by unauthenticated users (currently served publicly from `static/stream/`).

### Out of Scope

- Subscription Lifecycle Management — Client hasn't decided on a payment model, so handling Stripe webhooks for subscription updates/cancellations is deferred.
- User Database — Keeping authentication stateless for now; a database will only be added if the chosen paywall model requires it.

## Context

- The codebase is a SvelteKit app designed for Cloudflare Workers.
- It uses a custom Web Crypto API implementation for signing cookies to manage test access and Stripe success returns.
- There are significant architectural concerns regarding how the video feed is currently ingested and served. `ffmpeg` runs locally and writes to `static/stream/`, which will not work when deployed to Cloudflare.
- Security vulnerabilities exist: the `/api/test-access` endpoint is unprotected, Stripe success sessions are not invalidated after first use, and the raw HLS files are publicly accessible.

## Constraints

- **Tech Stack**: SvelteKit, Cloudflare Workers, Tailwind CSS v4, Bun, Vidstack.
- **Serverless Limitation**: Cloudflare Workers cannot run local binary processes (like `ffmpeg`) or dynamically write to a local file system.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Automatic Authentication (Skip Paywall) | Client hasn't decided on the paywall structure (one-time vs. subscription) | — Pending |

---
*Last updated: 2026-03-18 after initialization*
