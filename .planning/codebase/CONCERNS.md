# Codebase Concerns

**Analysis Date:** 2026-03-18

## Tech Debt

**Static HLS Serving via Local File System:**

- Issue: The application uses a local `ffmpeg` process to write HLS segments directly to the `static/stream/` directory. This violates the serverless deployment model intended by the Cloudflare adapter configuration. Workers cannot run local binary processes or dynamically modify the `static` directory at runtime.
- Files: `scripts/stream.ts`, `wrangler.jsonc`, `svelte.config.js`
- Impact: The application's core functionality (the stream) will fail when deployed to Cloudflare. It currently only functions as a local development proof-of-concept.
- Fix approach: Offload the RTSP ingestion and HLS generation to a dedicated media streaming server (e.g., MediaMTX, Cloudflare Stream, or an S3-backed containerized ffmpeg worker).

**Missing User Management (No Database):**

- Issue: The system does not utilize a database to track users or subscriptions. Access rights are granted purely via self-contained HMAC-signed cookies that are valid for 30 days.
- Files: `src/lib/server/subscription.ts`, `src/routes/api/stripe/webhook/+server.ts`
- Impact: There is no way to instantly revoke access if a user cancels their subscription. Webhook events cannot update user states, and users retain access until their cookie expires.
- Fix approach: Integrate a database (e.g., Turso, D1, PostgreSQL) to store users, link them to their Stripe Customer IDs, and validate their subscription status dynamically.

## Security Considerations

**Stripe Success Session Sharing:**

- Risk: The Stripe success endpoint validates a `session_id` and issues a subscription cookie. Completed Stripe checkout sessions do not invalidate after the first retrieval, meaning a user can share their success URL (`/api/stripe/success?session_id=...`) with anyone to generate unlimited 30-day access cookies for unauthorized users.
- Files: `src/routes/api/stripe/success/+server.ts`
- Current mitigation: None.
- Recommendations: Implement a database to ensure a checkout session is only "consumed" once and linked to a specific user account.

**Unprotected Test Access Endpoint:**

- Risk: The `/api/test-access` endpoint issues a valid 30-day subscription cookie to any POST request. It lacks environment checks, meaning this backdoor will be accessible in production.
- Files: `src/routes/api/test-access/+server.ts`
- Current mitigation: The cookie's `secure` flag is conditionally set based on the environment, but the endpoint itself is completely open.
- Recommendations: Restrict the endpoint to development environments using `if (!dev) throw error(404);` or remove it entirely before production deployment.

**Publicly Accessible HLS Stream Assets:**

- Risk: HLS stream files are served directly from the `static/stream/` directory. While the UI hides the player from unauthenticated users, the actual media files (`/stream/index.m3u8` and `.ts` segments) are publicly accessible to anyone who guesses or shares the path.
- Files: `src/routes/+page.server.ts`, `scripts/stream.ts`
- Current mitigation: The stream URL is conditionally passed to the frontend only if the user has a valid cookie.
- Recommendations: Move the stream out of the static directory and serve it through an authenticated API route, or implement signed URLs/CDN edge tokens for media access.

## Missing Critical Features

**Subscription Lifecycle Management:**

- Problem: The Stripe webhook endpoint only logs `checkout.session.completed` events and fails to handle crucial subscription lifecycle events (e.g., `customer.subscription.deleted`, `invoice.payment_failed`, `customer.subscription.updated`).
- Blocks: Prevents proper business operations and automated access revocation. Users who stop paying or cancel their subscriptions will continue to have access.
- Files: `src/routes/api/stripe/webhook/+server.ts`

---

_Concerns audit: 2026-03-18_
