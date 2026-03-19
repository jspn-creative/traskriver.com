# Phase 4: Signed URL Streaming - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Restore stream playback with Cloudflare Stream "Require Signed URLs" enabled. Deliver this through three changes: (1) a one-time provisioning script that generates a CF Stream signing key and outputs env vars, (2) server-side RS256 JWT generation via Web Crypto API inside `getStreamInfo()`, and (3) restructuring `+page.svelte` so the page shell renders immediately while only the VideoPlayer awaits the signed URL asynchronously.

Creating posts, paywall logic, session limits, and stream reconnection are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Signing Key Provisioning (SIGN-01)

- A new script `scripts/setup-signing.ts` handles one-time key provisioning — consistent with the `scripts/push-stream.ts` pattern.
- Script calls the CF Stream API and outputs `.env`-ready lines to stdout: `CF_STREAM_SIGNING_KEY_ID=...` and `CF_STREAM_SIGNING_JWK=...`. Developer pastes them into `.env` manually.
- Run via `bun run setup-signing` (add entry to `package.json`).
- Script reads `CF_STREAM_ACCOUNT_ID` and `CF_STREAM_API_TOKEN` from existing env vars — no new prerequisite vars needed, no `.env.example` changes.
- Script should fail clearly (throw with message) if those env vars are missing.

### JWT Generation (SIGN-02, SIGN-03)

- Token algorithm: RS256 (required by Cloudflare Stream signed URLs).
- Signing key sourced from `CF_STREAM_SIGNING_JWK` env var (JWK format, imported via `crypto.subtle.importKey`).
- Key ID sourced from `CF_STREAM_SIGNING_KEY_ID` env var (used as `kid` claim in JWT header).
- Token TTL: 1 hour (pre-decided — v2 SESS-01 handles 5-min playback limit separately).
- Required CF claims: `sub` (live input UID), `kid` (key ID), `exp` (Unix timestamp, now + 3600).
- Signed URL format: token replaces the live input UID in the manifest path — `https://customer-{code}.cloudflarestream.com/{TOKEN}/manifest/video.m3u8`.
- JWT generation lives in `getStreamInfo()` inside `src/routes/stream.remote.ts` — no new module needed.
- Use `$env/dynamic/private` for all new env vars (established Workers edge pattern).

### Page Shell vs Async Boundary (SIGN-04)

- Everything except VideoPlayer renders immediately as the page shell: header (Trask River title + live badge), sidebar (PassDetailsPanel, LocalWeather, TelemetryFooter).
- Only the VideoPlayer (and elements requiring `stream.liveHlsUrl`) lives inside a nested `<svelte:boundary>` with `await`.
- The outer `<svelte:boundary>` (current full-page boundary) is removed. The new nested boundary wraps the VideoPlayer area only.
- Header pending behavior: LiveViewerCount hides/shows `--` placeholder until stream data is available; status badge defaults to amber "Standby" (already its default state — no change needed there).
- VideoPlayer pending state: keep the existing "Preparing stream…" animated pulse text, but scoped to the player area instead of full-screen.
- Error state on signing failure: scoped to the player area (same `{#snippet failed}` pattern, contained within the nested boundary).

### Claude's Discretion

- Exact RS256 JWT encoding implementation (header+payload serialization, base64url encoding, signature assembly) — follow Web Crypto API patterns consistent with `subscription.ts`.
- Whether `CF_STREAM_SIGNING_JWK` is stored as a raw JSON string or pre-stringified — choose whatever `crypto.subtle.importKey` requires.
- LiveViewerCount conditional rendering approach (e.g., `{#if stream}` wrapper or prop defaulting).
- Exact structure of the nested boundary within the video area markup.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Cloudflare Stream Signed URLs

- No local spec — agents should reference CF Stream docs for signed URL JWT format: claims required (`sub`, `kid`, `exp`), token placement in manifest URL path, and JWK key provisioning API endpoint.

### Key source files to read before modifying

- `src/routes/stream.remote.ts` — where `getStreamInfo()` lives; JWT generation and signed URL construction go here
- `src/routes/+page.svelte` — full page restructure: remove outer boundary, add nested boundary around VideoPlayer only
- `src/lib/server/subscription.ts` — reference implementation for Web Crypto API patterns (`crypto.subtle.importKey`, base64url encoding) — use same style for RS256 JWT
- `scripts/push-stream.ts` — structural reference for the new `scripts/setup-signing.ts` script
- `package.json` — add `setup-signing` script entry
- `.env.example` — no changes needed per provisioning decision, but verify CF_STREAM_ACCOUNT_ID and CF_STREAM_API_TOKEN are already documented there

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `crypto.subtle` (Web Crypto API): Already used in `subscription.ts` for HMAC-SHA256 signing — same API handles RS256 JWT signing. The `toBase64Url()` helper and `encoder` (TextEncoder) in `subscription.ts` are directly reusable patterns for JWT encoding.
- `$env/dynamic/private`: Pattern for edge-compatible env var access — use for `CF_STREAM_SIGNING_KEY_ID` and `CF_STREAM_SIGNING_JWK`.
- `query()` from `$app/server`: Already wraps `getStreamInfo()` — no structural change needed to the remote function pattern.

### Established Patterns

- **Env var validation**: Functions throw a JS `Error` if required config is missing (e.g., the `customer?.trim()` check in `stream.remote.ts`). Follow the same pattern for the new signing key vars.
- **Script structure**: `scripts/push-stream.ts` uses Bun APIs, reads from env, and is run via `bun run`. New `setup-signing.ts` follows the same structure.
- **`<svelte:boundary>` with `{#snippet pending}` and `{#snippet failed}`**: Already implemented in `+page.svelte`. The restructure moves this boundary inward around the VideoPlayer, reusing the same snippet pattern.

### Integration Points

- `src/routes/stream.remote.ts:27` — `liveHlsUrl` construction line is the exact spot where the signed token replaces the live input UID.
- `src/routes/+page.svelte:39` — The outer `<svelte:boundary>` that currently wraps the full page. This is what gets restructured — the boundary moves to wrap only the VideoPlayer area.
- `src/routes/+page.svelte:69-76` — `<VideoPlayer>` component usage — this and its container move inside the new nested boundary.
- `package.json` — `scripts` section needs a `"setup-signing": "bun run scripts/setup-signing.ts"` entry.

</code_context>

<specifics>
## Specific Ideas

- No specific references or "I want it like X" moments — standard CF Stream signed URL approach.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 04-signed-url-streaming_
_Context gathered: 2026-03-19_
