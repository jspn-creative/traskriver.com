# Milestones

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
