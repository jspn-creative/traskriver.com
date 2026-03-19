# Project Retrospective

_A living document updated after each milestone. Lessons feed forward into future planning._

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-19
**Phases:** 3 | **Plans:** 4 | **Sessions:** 1

### What Was Built

- Automated user authentication — HMAC-signed subscription cookie auto-issued in SvelteKit `load()`, bypassing paywall until client decides on payment model
- Cloudflare Stream integration — replaced local `ffmpeg`-to-HLS script with RTMPS push script (`scripts/push-stream.ts`), unblocking Cloudflare Workers deployment
- Secure stream delivery — HLS URL constructed server-side from env vars; `$env/dynamic/private` used for Workers edge compatibility
- Production hardening — `/api/test-access` restricted to dev-only (404 in prod), stale HLS files removed from git tracking and gitignored

### What Worked

- **Yolo mode + well-structured plans:** Phase plans with detailed `<interfaces>` blocks (exact file contents + target state) meant execution required no codebase exploration — agents executed directly
- **Single-session throughput:** All 3 phases completed in ~1 day with 4 plans executed sequentially without blockers
- **Pre-researched env var pattern:** The `$env/dynamic/private` decision (vs static env or `process.env`) was surfaced during Phase 2 context/research and baked into the plan — zero rework

### What Was Inefficient

- **REQUIREMENTS.md traceability not updated at plan completion:** SEC-01 and SEC-02 remained marked `Pending` in the traceability table even after Phase 3 completed them — required manual correction at milestone close
- **`summary-extract` tool returned null one-liners:** The gsd-tools CLI couldn't extract one-liners from SUMMARY.md files (field `one_liner` returned null), so MILESTONES.md required manual authoring
- **`roadmap analyze` returned empty:** CLI returned 0 phases/plans despite valid phase directories — tool appears to rely on a different data source than the actual disk state

### Patterns Established

- `$env/dynamic/private` is the correct env var import for Cloudflare Workers (not `$env/static/private` or `process.env`)
- Cloudflare Stream HLS URL pattern: `https://customer-{CF_STREAM_CUSTOMER_CODE}.cloudflarestream.com/{CF_STREAM_LIVE_INPUT_UID}/manifest/video.m3u8`
- Dev-only API guard pattern: `import { dev } from '$app/environment'; if (!dev) throw error(404, 'Not found');`
- Gitignore negation for directory placeholders: `/static/stream/*` + `!/static/stream/.gitkeep`
- Cookie auth pattern in SvelteKit `load()`: check `hasActiveSubscription()` first, only create cookie if false

### Key Lessons

1. **Phase plan `<interfaces>` blocks eliminate execution ambiguity** — providing exact current file contents + full target file state means the executor never needs to explore the codebase
2. **Update traceability tables at plan completion, not milestone close** — leaving SEC-01/SEC-02 as Pending until milestone close introduced a false gap signal that required manual correction
3. **`gsd-tools` CLI readback is unreliable for disk-state verification** — `roadmap analyze` and `summary-extract` both returned empty/null; disk state must be verified directly (ls, cat) rather than via CLI abstraction

### Cost Observations

- Model mix: 100% sonnet (claude-sonnet-4-6)
- Sessions: 1 (all phases in single session)
- Notable: Yolo mode with pre-populated plan interfaces removed essentially all back-and-forth; execution was near-linear

---

## Milestone: v1.1 — Signed URL Streaming

**Shipped:** 2026-03-19
**Phases:** 1 | **Plans:** 3 | **Sessions:** 1

### What Was Built

- CF Stream signing key provisioning script (`scripts/setup-signing.ts`) — calls CF API, validates env vars early, outputs `.env`-ready `CF_STREAM_SIGNING_KEY_ID` + `CF_STREAM_SIGNING_JWK` to stdout
- RS256 JWT generation in `stream.remote.ts` via Web Crypto API — `crypto.subtle.importKey('jwk')` + `RSASSA-PKCS1-v1_5`; token (not raw UID) replaces live input UID in CF Stream HLS manifest URL; zero outbound API calls per request
- Restructured `+page.svelte` — removed full-page `<svelte:boundary>`; nested boundary scoped to VideoPlayer `absolute inset-0` container; `{#await getStreamInfo() then stream}` inline block defers only LiveViewerCount; header, sidebar, pass panel render immediately

### What Worked

- **CONTEXT.md captured all decision context upfront:** JWT claims format (`sub`/`kid`/`exp`), token placement in manifest URL, and base64-encoded JWK format were documented before any implementation — plans executed with zero design ambiguity
- **3 plans completed in under 10 minutes total:** Yolo mode + detailed interface blocks meant execution was nearly instantaneous; no back-and-forth on implementation details
- **Verification passed 10/10 on first attempt:** All VERIFICATION.md truths confirmed from static analysis; no unexpected gaps
- **Nested boundary pattern was clean and reusable:** Scoping async loading to a container via `absolute inset-0` inside a `relative` parent generalizes well for future deferred components

### What Was Inefficient

- **`gsd-tools summary-extract` one_liner field still returns null:** Same issue as v1.0 — MILESTONES.md accomplishments section required manual authoring again. The tool is not reliably extracting structured fields from SUMMARY.md frontmatter
- **`roadmap analyze` still returns empty phases:** Tool returned 0 phases/plans despite Phase 4 on disk. Still cannot be relied upon for state detection; disk-based checks (`ls`, `cat`) remain necessary
- **LiveViewerCount calls `getStreamInfo()` twice:** The inline `{#await getStreamInfo() then stream}` in the header duplicates the call made inside the `<svelte:boundary>`. SvelteKit query caching may deduplicate this, but it was not confirmed during this milestone

### Patterns Established

- CF Stream signed URL format: `https://customer-{customerCode}.cloudflarestream.com/{jwtToken}/manifest/video.m3u8` — token replaces raw live input UID
- RS256 JWT signing in Workers/edge: `crypto.subtle.importKey('jwk', jwkJson, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])` — JWK must be decoded from base64 via `atob()` + `JSON.parse()` before import
- JWT claims for CF Stream: `{ sub: liveInputUid, kid: signingKeyId, exp: Math.floor(Date.now() / 1000) + 3600 }`
- Nested boundary pattern for scoped async UI: wrap the async component in a `relative` container, make the boundary and its pending/error snippets use `absolute inset-0` positioning
- Dual-await pattern: one `{@const x = await query()}` inside the boundary for the primary component; one `{#await query() then x}` inline block for secondary components that need the same data without holding the rest of the UI

### Key Lessons

1. **Capture implementation decisions in CONTEXT.md before planning, not during** — having CF signed URL format, JWT spec, and base64-JWK decoding pattern documented in context meant the plan writer had everything needed; executor had zero uncertainty
2. **`gsd-tools` CLI is still unreliable for milestone operations** — `summary-extract` and `roadmap analyze` both returned empty/null results again; treat these as convenience tools and fall back to direct file reads for critical milestone operations
3. **Confirm SvelteKit query deduplication behavior when the same query is called multiple times in a template** — `{#await getStreamInfo()}` appears twice in `+page.svelte`; whether SvelteKit deduplicates the underlying fetch should be verified before v2.0

### Cost Observations

- Model mix: 100% sonnet (claude-sonnet-4-6)
- Sessions: 1 (all 3 plans in single session)
- Notable: Smallest milestone so far (1 phase, 3 plans) but cleanest execution — good plan interfaces = near-zero execution overhead

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change                                                      |
| --------- | -------- | ------ | --------------------------------------------------------------- |
| v1.0      | 1        | 3      | First milestone — baseline established                          |
| v1.1      | 1        | 1      | CONTEXT.md pre-captures all design decisions; fastest execution |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
| --------- | ----- | -------- | ------------------ |
| v1.0      | 0     | 0%       | 0                  |
| v1.1      | 0     | 0%       | 0                  |

### Top Lessons (Verified Across Milestones)

1. Detailed plan interfaces blocks (exact current + target file state) eliminate executor codebase exploration
2. Keep traceability tables current at plan completion — milestone close should find nothing to update
3. `gsd-tools` CLI (`summary-extract`, `roadmap analyze`) is unreliable for disk-state verification — use direct file reads instead
