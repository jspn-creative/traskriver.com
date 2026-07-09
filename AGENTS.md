# AGENTS.md

## Project Overview

traskriver.com is a live river-cam site: a Reolink camera streams the Trask River, self-hosted HLS replaces the former Cloudflare Stream setup (v1.2 milestone, complete). Monorepo workspaces: `packages/web` (SvelteKit site), `packages/stream` (VPS HLS service), `packages/shared`. The former `packages/relay` (Raspberry Pi ffmpeg push relay) has been eliminated — the VPS now pulls RTSP directly from the camera over DDNS.

## Architecture / Streaming Pipeline

- Camera: Reolink RLC-510WA, 2560×1920 h.264, RTSP over DDNS (tplinkdns). Current stream settings: max bitrate 3072 kbps, 20 fps, i-frame interval 2s (aligned to 2s HLS segments). Camera-site upload tests ~40Mbps — bitrate ceiling lives well below that.
- VPS (DigitalOcean, managed via xCloud): MediaMTX pulls RTSP and serves HLS internally (`MEDIAMTX_HLS_PORT`, default 8888, deployed as 8876; control API :9997). A Hono app (`packages/stream/src/server.ts`) supervises MediaMTX and proxies `/trask/*` to it on `PORT` 8088. OpenLiteSpeed fronts the VPS and proxies `/trask/` → `127.0.0.1:8088`.
- Cloudflare (orange-cloud proxied) fronts `stream.traskriver.com` and caches HLS — see Bandwidth/Caching below.
- MediaMTX is a standalone Go binary (not npm), installed pinned by the deploy script to `/var/www/stream.traskriver.com/bin/mediamtx`. Don't reuse `:8888`/`:8876` for the Hono `PORT`.

## Bandwidth / Caching Design (added 2026-07-08)

- The Hono proxy (NOT OpenLiteSpeed) rewrites `Cache-Control`: `.m3u8` → `public, max-age=1`; `.ts` → `public, max-age=86400, immutable` (commit `f32a774`).
- Cloudflare does not cache `.ts`/`.m3u8` by default extension list — a Cache Rule is required and exists: `(http.host eq "stream.traskriver.com" and http.request.uri.path wildcard r"/trask/*")` → Eligible for cache, Edge TTL "use cache-control header if present, bypass if not".
- Verify caching with `curl -sI https://stream.traskriver.com/trask/<seg>.ts` twice → `cf-cache-status: HIT`; playlists cycle MISS/EXPIRED (expected at max-age=1).
- `HLS_SEGMENT_COUNT=6` (× 2s segments = 12s live window, by design); single rendition, no ABR ladder (deliberate).
- Web player keeps autoplay but calls `hls.stopLoad()` on pause/hidden-tab and caps `maxBufferLength: 15`; poster image removed entirely.
- Cloudflare self-serve ToS discourages video via plain CDN even on Pro; acceptable risk at current scale — fallback plan is a video-friendly CDN (e.g. Bunny) in front of the HLS path only.

## Deployment

- **User handles deployment/CI-CD themselves (DigitalOcean via xCloud) — do not plan around specific deploy providers.**
- Web: Cloudflare (wrangler / `npx wrangler versions upload`); ensure `wrangler` is available in the deploy environment.
- Stream: xCloud's Node.js SSR mode runs the app under **pm2** (app name `nodejs-stream.traskriver.com`, command `bun run start:stream`, port 8088). There is **no systemd `stream.service` in the current setup** — earlier notes about a systemd unit + sudoers drop-in are obsolete; if the old unit still exists on the server it should be disabled (a second starter causes `EADDRINUSE :8088` in the pm2 logs).
- The **live** deploy script and `.env` are maintained in the xCloud dashboard, not applied from the repo. Repo copies at `packages/stream/reference/` are reference-only; `scripts/` contains older stale copies. Deploys build TS via `bun install --frozen-lockfile && bun run build:stream`; runtime env lives in `packages/stream/.env` (`RTSP_URL`, `PORT`, `MEDIAMTX_HLS_PORT`, `HLS_DIR`, `MEDIAMTX_BIN`, `HLS_SEGMENT_COUNT`) — NOT root `.env`.
- **The server checkout at `/var/www/stream.traskriver.com` must track `main`.** Incident 2026-07-08: it sat on `gsd/phase-08-web-swap-full-cleanup` with uncommitted hand edits, so deploys "succeeded" while rebuilding stale code. After any deploy, confirm `git log --oneline -1` on the server matches origin/main and restart pm2.

## Dev

- Bun package manager + Turbo (`bun check`, `bun run build`). No ESLint — Prettier is the style gate (`packages/web/.prettierrc`: tabs, single quotes, `trailingComma: none`, `printWidth: 100`).
- Web: SvelteKit 2 / Svelte 5 runes, deployed to Cloudflare Workers (`wrangler`). Stream: Hono on Node 22, `tsc` emit.

## Learned User Preferences

- When proposing a framework/library, offer alternatives for discussion rather than committing to one (user pushed back on Fastify).
- When user requests removal of a tool (e.g., Counterscale → PostHog), remove it completely; no soft-deprecation.
- For greenfield replacements where the app isn't in production use, skip cutover/fallback plans and ship on a new branch.
- For server-side fixes, keep changes scoped to `/var/www/stream.traskriver.com` unless explicitly approved otherwise. SSH access is diagnose-first: don't mutate server state without explicit approval.

## Gotchas

- Analytics: PostHog (replaced Counterscale). High-frequency HLS diagnostics (`hls_frag_loaded`/`hls_level_loaded`) were removed 2026-07 — don't reintroduce per-fragment capture.
- Pre-commit hooks use `hk.pkl` (jdx/hk); set `stash = "git"` on the `pre-commit` block to prevent `fix = true` formatters from auto-staging unstaged changes alongside the intended commit.
- `packages/web/src/lib/components/VideoPlayer.svelte`: mobile Safari emits transient `waiting`/`stalled` events while playing fine — debounce buffering=true (~1200ms) and listen to multiple media events (`can-play`, `playing`, `play`) to reliably exit the `connecting` state.
- The VideoPlayer/hls.js integration is historically fragile across dependency bumps and browser behavior changes — after touching it or upgrading hls.js/vidstack, verify playback manually (desktop + mobile Safari).
- `packages/web` has no automated tests (stream has minimal coverage) — player and route changes need manual verification.
