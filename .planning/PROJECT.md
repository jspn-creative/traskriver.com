# River Stream

## What This Is

A website with an "always on" livestream video feed (like a 24/7 nature camera) available behind a paywall. The implementation uses Cloudflare Workers, SvelteKit, and Cloudflare Stream for RTSP ingestion and HLS delivery. Stream playback is protected by Cloudflare Stream's "Require Signed URLs" feature — the server generates RS256 JWTs server-side per request. Authentication is currently bypassed automatically (paywall deferred until client decides on payment model).

## Core Value

Reliably deliver a continuous, high-quality livestream to authenticated users.

## Current Milestone: v3.0 On-Demand Streaming

Monorepo: SvelteKit in `packages/web`, relay service in `packages/relay`, shared types in `packages/shared`. Root `bun dev` runs web + relay; `turbo` orchestrates `build` / `check`. Phase 07 complete - relay now polls demand, runs ffmpeg, posts relay status, and exposes optional `/health`.

## Requirements

### Validated

- ✓ Play HLS video stream using Vidstack (`packages/web/src/lib/components/VideoPlayer.svelte`) — existing
- ✓ Basic stateless cookie-based authentication via HMAC SHA-256 (`packages/web/src/lib/server/subscription.ts`) — existing
- ✓ Stripe Checkout integration for purchasing access (`packages/web/src/routes/api/stripe/checkout/+server.ts`) — existing
- ✓ Authenticate users automatically (skip the paywall step) — v1.0
- ✓ Move RTSP ingestion to Cloudflare Stream via RTMPS push script (`scripts/push-stream.ts`) — v1.0
- ✓ Deliver HLS stream URL server-side from Cloudflare Stream via `$env/dynamic/private` — v1.0
- ✓ Restrict `/api/test-access` to dev-only environments (throws 404 in production) — v1.0
- ✓ Remove publicly accessible HLS files from `static/stream/` and gitignore future writes — v1.0
- ✓ Generate Cloudflare Stream signing key and store in env vars (SIGN-01) — v1.1
- ✓ Generate signed HLS JWT server-side via Web Crypto API (SIGN-02, SIGN-03) — v1.1
- ✓ Restructure page to render immediately with VideoPlayer in nested async boundary (SIGN-04) — v1.1
- ✓ Demand API: KV `RIVER_KV`, POST/GET `/api/stream/demand`, POST `/api/relay/status`, button-gated stream start (DEMA-01–03) — Phase 06
- ✓ Relay runtime: FSM + demand poller + status reporter + ffmpeg manager + health endpoint (RLAY-01-06) — Phase 07

### Active

- [ ] Implement final paywall logic based on client's chosen model — one-time purchase or subscription (PAY-01)
- [ ] Validate Stripe success session IDs to ensure they are single-use (PAY-02)
- [ ] Implement Stripe webhooks for subscription lifecycle management (PAY-03)
- [ ] Stop stream playback after 5 minutes, requiring user action to restart (SESS-01)

### Out of Scope

- User Database — Keeping authentication stateless for now; a database will only be added if the chosen paywall model requires it.
- Subscription Lifecycle Management — Deferred until client decides on payment model.
- Token expiry / refresh handling — TTL set to 1 hour; session limited to 5 min by v2.0 SESS-01 anyway.

## Context

- The codebase is a Bun monorepo: SvelteKit app in `packages/web` deployed to Cloudflare Workers.
- RTSP stream is ingested via `scripts/push-stream.ts` at repo root (legacy; relay service in `packages/relay` for v3.0).
- HLS stream URL is constructed server-side in `packages/web/src/routes/stream.remote.ts`; signed JWT token (RS256 via Web Crypto) replaces raw live input UID in the manifest path.
- CF Stream "Require Signed URLs" is enabled — plain HLS URLs return 401. Server must sign every request.
- Stream starts only after user registers demand (POST `/api/stream/demand`); `getStreamInfo` runs inside `<svelte:boundary>` after that. Relay polls GET demand and POSTs status (Phase 06).
- Page shell renders immediately; header/sidebar render without waiting for signed URL; video area is poster until demand.
- Authentication is currently open (all visitors auto-authenticated) — paywall logic is deferred until client decides on model.
- Tech stack: SvelteKit, Cloudflare Workers, Tailwind CSS v4, Bun, Turbo, Vidstack, Cloudflare Stream.

### Known Issues (Pending Todos)

- **Viewer count fluctuation** — LiveViewerCount polls /views every 10s; console shows 0/1/2 fluctuating with no user action. Investigate duplicate instances, CF API noise, smoothing strategy.
- **Safari HLS buffer stall errors** — Safari triggers repeated non-fatal `bufferStalledError` hls-error events; VideoPlayer treats all errors as fatal. Fix: gate `onError` on `e.detail.fatal === true`.

## Constraints

- **Tech Stack**: SvelteKit, Cloudflare Workers, Tailwind CSS v4, Bun, Vidstack, Cloudflare Stream.
- **Serverless Limitation**: Cloudflare Workers cannot run local binary processes or write to local filesystem — RTSP ingestion must be external.
- **Auth Model**: Client hasn't decided on paywall structure (one-time vs. subscription) — paywall implementation deferred.

## Key Decisions

| Decision                                     | Rationale                                                                                                | Outcome                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Automatic Authentication (Skip Paywall)      | Client hasn't decided on the paywall structure (one-time vs. subscription)                               | ✓ Good — ships unblocked while paywall is decided |
| Cloudflare Stream for RTSP ingestion         | Serverless Workers can't run ffmpeg locally; Cloudflare Stream handles RTMPS ingest and HLS delivery     | ✓ Good — resolved the core deployment blocker     |
| `$env/dynamic/private` for env vars          | Cloudflare Workers resolves env vars at request time (not build time); static env breaks at edge         | ✓ Good — required for Workers compatibility       |
| `error(404)` not `error(403)` on test-access | 404 avoids leaking that the endpoint exists in production                                                | ✓ Good — security best practice                   |
| `git rm --cached` for stale HLS files        | Remove git tracking without deleting local files; gitignore prevents future commits                      | ✓ Good — clean separation of generated assets     |
| CF_STREAM_SIGNING_JWK stored as base64 JWK   | Format returned directly from CF API; matches what `crypto.subtle.importKey('jwk', ...)` expects         | ✓ Good — no encoding conversion needed            |
| RS256 via Web Crypto (no CF API per request) | Signing key imported once per request via `crypto.subtle`; avoids CF API rate limits and latency         | ✓ Good — pure edge-compute signing, zero overhead |
| Nested `<svelte:boundary>` for VideoPlayer   | Scope "Preparing stream…" state to video area only; header/sidebar render without waiting for signed URL | ✓ Good — better perceived performance             |
| `{#await}` inline for LiveViewerCount        | Defers only the viewer count in the header; title, badge, and sidebar render immediately                 | ✓ Good — minimal blocking, no full-header delay   |

---

_Last updated: 2026-04-08 after Phase 07 relay service_
