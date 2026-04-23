## Learned User Preferences

- When proposing a framework/library, offer alternatives on the roadmap for discussion rather than committing to one (user pushed back on Fastify).
- User handles deployment/CI-CD themselves (DigitalOcean via xCloud) — do not plan around specific deploy providers.
- Use the GSD workflow (`.planning/`, `/gsd-*` skills) for milestone/phase work.
- When user requests removal of a tool (e.g., Counterscale → PostHog), remove it completely; no soft-deprecation.
- For greenfield replacements where the app isn't in production use, skip cutover/fallback plans and ship on a new branch.
- For server-side fixes, keep changes scoped to `/var/www/stream.traskriver.com` unless explicitly approved otherwise.

## Learned Workspace Facts

- Monorepo with `packages/*` (notably `packages/relay` and `packages/stream`).
- `packages/relay` runs on a Raspberry Pi 3 via ffmpeg, pushing camera stream upstream.
- Onsite camera is Reolink RLC-510WA (2560x1920, h.264/h.265, RTSP/RTMP, DDNS, adjustable bitrate/fps/i-frame).
- v1.2 milestone: replace Cloudflare Stream with self-hosted Node VPS (`packages/stream`); optionally eliminate the Pi relay.
- Web deploy uses Cloudflare Workers (`npx wrangler versions upload`); ensure `wrangler` is available in the deploy environment.
- Analytics: PostHog (replaced Counterscale).
- Upload bandwidth at camera site tests ~40Mbps despite 2Gbps plan; relay is on the same LAN as camera.
- Stream deploys are run from repo root using root scripts (`build:stream`, `start:stream`) and filtered install (`bun install --filter @traskriver/stream`).
- Stream VPS already runs OpenLiteSpeed; prefer it for reverse-proxy/cache-header rewriting, with Caddy as fallback.
- Stream runs as `stream` user via `/etc/systemd/system/stream.service` (root-managed, not rewritten per deploy). `stream` has a narrow NOPASSWD sudoers drop-in at `/etc/sudoers.d/stream-deploy` for `systemctl restart/is-active/status/daemon-reload stream`; sudo matches args literally, so include every flag variant the deploy script uses (e.g. `--quiet`, `--no-pager`). Long-running commands like `bun run start:stream` block the foreground and must run via systemd, not inline in the deploy script.
- MediaMTX is a standalone Go binary (not npm); `deploy-stream.sh` installs pinned `MEDIAMTX_VERSION` to `/var/www/stream.traskriver.com/bin/mediamtx` idempotently. Internal HLS origin on `:8888`, control API on `:9997` — don't reuse `:8888` for the Hono server `PORT`.
- Stream runtime env lives in `packages/stream/.env` (keys: `RTSP_URL`, `PORT`, `MEDIAMTX_HLS_PORT`, `HLS_DIR`, `MEDIAMTX_BIN`) — NOT root `.env`.
