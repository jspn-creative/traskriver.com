# Milestones

## v1.1 Signed URL Streaming (Shipped: 2026-03-19)

**Phases completed:** 1 phase, 3 plans, 4 tasks
**Timeline:** 2026-03-19 (1 day)
**Codebase:** ~1,172 LOC (TypeScript + Svelte, src/ + scripts/)
**Git range:** feat(04-01) `28dbe14` → feat(04-03) `8a6bff1`

**Key accomplishments:**

- Created `scripts/setup-signing.ts` — one-time CF Stream signing key provisioning script that calls the CF API and outputs `.env`-ready `CF_STREAM_SIGNING_KEY_ID` and `CF_STREAM_SIGNING_JWK` lines to stdout
- Implemented RS256 JWT generation in `stream.remote.ts` via Web Crypto API (`crypto.subtle.importKey` + `RSASSA-PKCS1-v1_5`) — zero outbound API calls per request; token (not raw UID) replaces live input UID in CF Stream HLS manifest URL
- Restructured `+page.svelte` — removed full-page `<svelte:boundary>`; nested boundary scoped to VideoPlayer container; header, sidebar, and pass panel render immediately on page load

**Requirements shipped:** SIGN-01, SIGN-02, SIGN-03, SIGN-04 (4/4 v1.1 requirements)

---

## v1.0 MVP (Shipped: 2026-03-19)

**Phases completed:** 3 phases, 4 plans, 7 tasks
**Timeline:** 2026-03-18 (1 day)
**Codebase:** ~809 LOC (TypeScript + Svelte)

**Key accomplishments:**

- Automated user authentication via HMAC-signed subscription cookie auto-issued in SvelteKit `load()` — users never hit a paywall
- Replaced local `ffmpeg`-to-HLS script with a Cloudflare Stream RTMPS push script (`scripts/push-stream.ts`), enabling Cloudflare Workers deployment
- SvelteKit page updated to deliver the HLS stream URL from Cloudflare Stream via `$env/dynamic/private` — fully server-side, no env vars leak to client
- `/api/test-access` endpoint restricted to dev-only (returns 404 in production) preventing unauthorized cookie issuance
- Stale HLS files removed from git tracking; `static/stream/` gitignored to prevent future public asset exposure

**Requirements shipped:** AUTH-01, STRM-01, STRM-02, SEC-01, SEC-02 (5/5 v1 requirements)

---

_Archive: `.planning/milestones/v1.0-ROADMAP.md` | `.planning/milestones/v1.0-REQUIREMENTS.md`_
