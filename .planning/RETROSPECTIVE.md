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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change                             |
| --------- | -------- | ------ | -------------------------------------- |
| v1.0      | 1        | 3      | First milestone — baseline established |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
| --------- | ----- | -------- | ------------------ |
| v1.0      | 0     | 0%       | 0                  |

### Top Lessons (Verified Across Milestones)

1. Detailed plan interfaces blocks (exact current + target file state) eliminate executor codebase exploration
2. Keep traceability tables current at plan completion — milestone close should find nothing to update
