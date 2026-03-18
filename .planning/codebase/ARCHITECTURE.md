# Architecture

**Analysis Date:** 2026-03-18

## Pattern Overview

**Overall:** Serverless Edge Application / SvelteKit SSR

**Key Characteristics:**

- Designed for edge deployment (Cloudflare Workers via `@sveltejs/adapter-cloudflare`).
- Stateless authentication and session management using signed HTTP-only cookies (avoids database roundtrips at the edge).
- Native Web Crypto API integration (`crypto.subtle`) for token generation and verification.
- Decoupled media ingestion: uses a background Node/Bun script to transcode RTSP into static HLS segments served directly.

## Layers

**Routing & View Layer:**

- Purpose: Maps URLs to Svelte view components and handles server-side data loading.
- Location: `src/routes/`
- Contains: Svelte components (`+page.svelte`, `+layout.svelte`), Server Loaders (`+page.server.ts`).
- Depends on: Component Layer, Domain Services.
- Used by: End users (browsers).

**API Layer:**

- Purpose: Exposes HTTP endpoints for frontend actions and external webhooks (e.g., Stripe).
- Location: `src/routes/api/`
- Contains: SvelteKit server endpoints (`+server.ts`).
- Depends on: Domain Services.
- Used by: Frontend forms, Stripe Webhooks.

**Domain Services (Server):**

- Purpose: Encapsulates core business logic, secret management, and external service interactions.
- Location: `src/lib/server/`
- Contains: Pure TypeScript modules (`stripe.ts`, `subscription.ts`).
- Depends on: SvelteKit environment variables (`$env/dynamic/private`), Stripe Node SDK.
- Used by: Routing Layer, API Layer.

**Component Layer:**

- Purpose: Reusable UI elements for the frontend application.
- Location: `src/lib/components/`
- Contains: Svelte components (e.g., `VideoPlayer.svelte`).
- Depends on: External frontend libraries (e.g., Vidstack).
- Used by: View Layer.

## Data Flow

**Subscription Acquisition (Test Access):**

1. User submits POST to `/api/test-access`.
2. Endpoint calls `createSubscriptionCookie()` in `src/lib/server/subscription.ts`.
3. System generates a JSON payload, signs it using HMAC SHA-256 (`crypto.subtle`) with `COOKIE_SECRET`, and sets it as an HTTP-only cookie.
4. User is redirected to `/` with the newly minted access cookie.

**Content Access Verification:**

1. User requests `/` page.
2. SvelteKit runs `load` function in `src/routes/+page.server.ts`.
3. Server retrieves the `subscription` cookie and calls `hasActiveSubscription()`.
4. System verifies the HMAC signature. If valid and unexpired, it injects the secret `streamUrl` into the page data.
5. Client-side Svelte renders the `VideoPlayer.svelte` component utilizing the `streamUrl`.

**State Management:**

- Application uses completely stateless, self-contained signed cookies (`subscription`) for authorization.
- The cookie payload contains a base64-encoded JSON object (e.g., `{ active: true, expiresAt: 1234567890 }`) accompanied by a signature.
- There is no central database for managing session state or user accounts; access is purely token-driven.

## Key Abstractions

**Subscription Manager:**

- Purpose: Creates and validates access tokens using native web cryptography.
- Examples: `src/lib/server/subscription.ts`
- Pattern: JWT-like signed tokens (Base64Url Payload + HMAC Signature).

**Stripe Integrator:**

- Purpose: Manages Stripe SDK initialization, configuration validation, and webhook secret management.
- Examples: `src/lib/server/stripe.ts`
- Pattern: Singleton/Lazy initialization (`stripe ??= new Stripe(...)`).

## Entry Points

**Web Application Frontend:**

- Location: `src/routes/+page.svelte`
- Triggers: User visiting the root URL.
- Responsibilities: Displays marketing copy, conditionally shows the video player if the user has an active subscription, or displays purchase/test options if not.

**Checkout Session Initiator:**

- Location: `src/routes/api/stripe/checkout/+server.ts`
- Triggers: User initiating a Stripe purchase.
- Responsibilities: Validates Stripe config, creates a Checkout Session, redirects user to Stripe hosted checkout.

**Stripe Webhook:**

- Location: `src/routes/api/stripe/webhook/+server.ts`
- Triggers: Incoming HTTP POST from Stripe servers.
- Responsibilities: Validates webhook signatures using the Stripe SDK, logs or processes `checkout.session.completed` events.

**Stream Ingestion Script:**

- Location: `scripts/stream.ts`
- Triggers: Run manually or as a background service (`bun run stream`).
- Responsibilities: Spawns FFmpeg to pull an RTSP camera feed (`CAMERA_RTSP_URL`) and segment it into static HLS files (`static/stream/index.m3u8`).

## Error Handling

**Strategy:** Fail-fast with clear HTTP status codes.

**Patterns:**

- SvelteKit `error` throwing: Endpoints and page loaders use `@sveltejs/kit`'s `throw error(status, message)` to halt execution and return correct HTTP responses.
- Configuration validation: Startup or lazy-loaded services (like Stripe) throw immediate JS Errors if required environment variables are missing (`requireEnv`).

## Cross-Cutting Concerns

**Validation:** Environment variables are validated on use (e.g., checking `isStripeConfigured()` before attempting to create a checkout session).
**Authentication/Authorization:** Implemented via custom HMAC-signed cookies verified in the server loader of protected routes.
**Media Processing:** Delegated completely to background CLI tools (`FFmpeg` via `Bun.spawn`), outputting static files to be served by the web server layer.

---

_Architecture analysis: 2026-03-18_
