# River Stream

## What This Is

A website with an "always on" livestream video feed (like a 24/7 nature camera) available behind a paywall. The implementation uses Cloudflare Workers, SvelteKit, and Cloudflare Stream for RTSP ingestion and HLS delivery. Authentication is currently bypassed automatically (paywall deferred until client decides on payment model).

## Core Value

Reliably deliver a continuous, high-quality livestream to authenticated users.

## Current Milestone: v1.1 Signed URL Streaming

**Goal:** Restore stream playback with Cloudflare Stream Signed URLs enabled, using server-side JWT signing and async page delivery.

**Target features:**

- Cloudflare Stream signing key provisioned and stored in env vars
- Server-side JWT token generation via Web Crypto API (no per-request CF API call)
- Page renders immediately; VideoPlayer awaits signed URL via nested `<svelte:boundary>`

## Requirements

### Validated

- ✓ Play HLS video stream using Vidstack (`src/lib/components/VideoPlayer.svelte`) — existing
- ✓ Basic stateless cookie-based authentication via HMAC SHA-256 (`src/lib/server/subscription.ts`) — existing
- ✓ Stripe Checkout integration for purchasing access (`src/routes/api/stripe/checkout/+server.ts`) — existing
- ✓ Authenticate users automatically (skip the paywall step) — v1.0
- ✓ Move RTSP ingestion to Cloudflare Stream via RTMPS push script (`scripts/push-stream.ts`) — v1.0
- ✓ Deliver HLS stream URL server-side from Cloudflare Stream via `$env/dynamic/private` — v1.0
- ✓ Restrict `/api/test-access` to dev-only environments (throws 404 in production) — v1.0
- ✓ Remove publicly accessible HLS files from `static/stream/` and gitignore future writes — v1.0

### Active

- [ ] Generate Cloudflare Stream signing key and store in env vars (SIGN-01)
- [ ] Generate signed HLS JWT server-side via Web Crypto API (SIGN-02, SIGN-03)
- [ ] Restructure page to render immediately with VideoPlayer in nested async boundary (SIGN-04)

### Out of Scope

- User Database — Keeping authentication stateless for now; a database will only be added if the chosen paywall model requires it.
- Subscription Lifecycle Management — Deferred until client decides on payment model.

## Context

- The codebase is a SvelteKit app deployed to Cloudflare Workers.
- RTSP stream is ingested via `scripts/push-stream.ts` (ffmpeg → RTMPS → Cloudflare Stream).
- HLS stream URL is constructed server-side in `src/routes/stream.remote.ts` from `CF_STREAM_CUSTOMER_CODE` + `CF_STREAM_LIVE_INPUT_UID` env vars.
- All v1 security concerns resolved: test-access endpoint dev-gated, static HLS files removed from tracking.
- Authentication is currently open (all visitors auto-authenticated) — paywall logic is deferred.
- ~809 LOC TypeScript + Svelte. Tech stack: SvelteKit, Cloudflare Workers, Tailwind CSS v4, Bun, Vidstack, Cloudflare Stream.

## Constraints

- **Tech Stack**: SvelteKit, Cloudflare Workers, Tailwind CSS v4, Bun, Vidstack, Cloudflare Stream.
- **Serverless Limitation**: Cloudflare Workers cannot run local binary processes or write to local filesystem — RTSP ingestion must be external.
- **Auth Model**: Client hasn't decided on paywall structure (one-time vs. subscription) — paywall implementation deferred.

## Key Decisions

| Decision                                     | Rationale                                                                                            | Outcome                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Automatic Authentication (Skip Paywall)      | Client hasn't decided on the paywall structure (one-time vs. subscription)                           | ✓ Good — ships unblocked while paywall is decided |
| Cloudflare Stream for RTSP ingestion         | Serverless Workers can't run ffmpeg locally; Cloudflare Stream handles RTMPS ingest and HLS delivery | ✓ Good — resolved the core deployment blocker     |
| `$env/dynamic/private` for env vars          | Cloudflare Workers resolves env vars at request time (not build time); static env breaks at edge     | ✓ Good — required for Workers compatibility       |
| `error(404)` not `error(403)` on test-access | 404 avoids leaking that the endpoint exists in production                                            | ✓ Good — security best practice                   |
| `git rm --cached` for stale HLS files        | Remove git tracking without deleting local files; gitignore prevents future commits                  | ✓ Good — clean separation of generated assets     |

---

_Last updated: 2026-03-19 after v1.1 milestone start_
