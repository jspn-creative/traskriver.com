## Learned User Preferences

- When proposing a framework/library, offer alternatives on the roadmap for discussion rather than committing to one (user pushed back on Fastify).
- User handles deployment/CI-CD themselves (DigitalOcean via xCloud) — do not plan around specific deploy providers.
- Use the GSD workflow (`.planning/`, `/gsd-*` skills) for milestone/phase work.
- When user requests removal of a tool (e.g., Counterscale → PostHog), remove it completely; no soft-deprecation.
- For greenfield replacements where the app isn't in production use, skip cutover/fallback plans and ship on a new branch.

## Learned Workspace Facts

- Monorepo with `packages/*` (notably `packages/relay` and `packages/stream`).
- `packages/relay` runs on a Raspberry Pi 3 via ffmpeg, pushing camera stream upstream.
- Onsite camera is Reolink RLC-510WA (2560x1920, h.264/h.265, RTSP/RTMP, DDNS, adjustable bitrate/fps/i-frame).
- v1.2 milestone: replace Cloudflare Stream with self-hosted Node VPS (`packages/stream`); optionally eliminate the Pi relay.
- Web deploy uses Cloudflare Workers (`npx wrangler versions upload`); ensure `wrangler` is available in the deploy environment.
- Analytics: PostHog (replaced Counterscale).
- Upload bandwidth at camera site tests ~40Mbps despite 2Gbps plan; relay is on the same LAN as camera.
