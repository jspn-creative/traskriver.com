# Phase 2: Serverless Media Streaming - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning
**Source:** User decisions (inline, no discuss-phase)

<domain>
## Phase Boundary

This phase moves the RTSP-to-HLS pipeline off the local machine and onto Cloudflare Stream. A push script will ingest the RTSP camera feed and push it to Cloudflare Stream. The SvelteKit VideoPlayer component will be updated to load the stream from Cloudflare Stream's HLS endpoint instead of the local `static/stream/index.m3u8`. The local `scripts/stream.ts` ffmpeg script is deleted — no local fallback is needed.

**In scope:**

- Integrate Cloudflare Stream as the HLS delivery layer
- Create a push script that ingests RTSP and pushes to Cloudflare Stream (replaces `scripts/stream.ts`)
- Update `VideoPlayer.svelte` / `+page.server.ts` to serve the Cloudflare Stream HLS URL
- Remove `scripts/stream.ts` and the `bun run stream` npm script
- Add required Cloudflare Stream env vars to `.env.example`

**Out of scope:**

- Raspberry Pi setup (production hardware — future concern)
- Stream security / signed URLs (Phase 3)
- Any paywall changes

</domain>

<decisions>
## Implementation Decisions

### Streaming Service

- **LOCKED:** Use **Cloudflare Stream** as the media streaming service. No alternatives.

### Push vs Pull Architecture

- **LOCKED:** Push model — a local script pushes the RTSP camera feed to Cloudflare Stream via RTMP/SRT. The script is analogous to the existing `scripts/stream.ts` but targets Cloudflare Stream's ingest endpoint instead of writing local HLS files.
- In production, a Raspberry Pi will run this push script from the deployed camera location.

### Local FFmpeg Script

- **LOCKED:** Delete `scripts/stream.ts` entirely. No fallback. The `bun run stream` script entry in `package.json` should also be removed or replaced with the new push-to-Cloudflare script.

### VideoPlayer Source

- **LOCKED:** `VideoPlayer.svelte` must load the stream from Cloudflare Stream's HLS delivery URL (format: `https://customer-{code}.cloudflarestream.com/{uid}/manifest/video.m3u8` for live, or the live input HLS URL). The `streamUrl` returned by `+page.server.ts` must point to this external URL.

### Claude's Discretion

- Exact Cloudflare Stream API integration pattern (using REST API vs SDK vs direct FFmpeg RTMP push)
- Whether to use `CF_STREAM_LIVE_INPUT_UID` + HLS URL or full API-managed approach
- Error handling if the Cloudflare Stream endpoint is unreachable
- Whether to keep or update the "Access active" status card text in `+page.svelte`

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above.

### Key source files to read before modifying:

- `scripts/stream.ts` — the script being deleted (understand what it did)
- `src/lib/components/VideoPlayer.svelte` — the component receiving the new `src` URL
- `src/routes/+page.server.ts` — where `streamUrl` is constructed and returned
- `src/routes/+page.svelte` — where UI text referencing local HLS should be updated
- `package.json` — where the `stream` script entry lives
- `.env.example` — where new Cloudflare env vars must be added

</canonical_refs>

<specifics>
## Specific Ideas

- Cloudflare Stream live input ingest: push via RTMP (`rtmps://live.cloudflare.com:443/live/{LIVE_INPUT_KEY}`) using ffmpeg
- HLS playback URL format: `https://customer-{CUSTOMER_CODE}.cloudflarestream.com/{LIVE_INPUT_UID}/manifest/video.m3u8`
- New env vars needed: `CF_STREAM_LIVE_INPUT_UID`, `CF_STREAM_CUSTOMER_CODE`, `CF_STREAM_LIVE_INPUT_KEY` (or equivalent)
- The push script should be a standalone Bun/Node script similar in structure to `scripts/stream.ts` — spawn ffmpeg with RTMP output instead of HLS output

</specifics>

<deferred>
## Deferred Ideas

- Raspberry Pi hardware provisioning (production deployment — not this phase)
- Stream authentication / signed URL tokens for the HLS manifest (Phase 3: SEC-01)
- Monitoring or alerting if the stream goes down
- Automatic stream reconnection logic

</deferred>

---

_Phase: 02-serverless-media-streaming_
_Context gathered: 2026-03-18 via user inline decisions_
