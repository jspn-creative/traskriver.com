# Phase 09: Relay Deployment - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Provision a Raspberry Pi from SD card flash to fully operational relay with one setup script. Auto-recovers from failures via systemd. Remotely manageable via Tailscale. Deploy pipeline pushes updates from GitHub to Pi. Relay code (Phase 07) must exist before deployment — this phase creates the infrastructure to run and maintain it.

</domain>

<decisions>
## Implementation Decisions

### Setup script scope
- **D-01:** Split into two scripts: `setup.sh` (OS-level, run once on fresh Pi) and `configure.ts` (app-level, re-runnable for updates)
- **D-02:** `setup.sh` handles: install Bun, ffmpeg, Tailscale (with auth key from .env); create dedicated `relay` user (no sudo, no login shell); SD card hardening; move .env from boot partition to /opt/river-relay/.env
- **D-03:** `configure.ts` handles: git pull, bun install, copy systemd unit file to /etc/systemd/system/, daemon-reload, restart service — fully idempotent, safe to re-run
- **D-04:** SD card hardening: disable swap, volatile journald (Storage=volatile), tmpfs for /tmp and /var/tmp, noatime on root filesystem. NO unattended-upgrades — manual updates only via Tailscale SSH to avoid surprise reboots on headless device
- **D-05:** Relay code lives at `/opt/river-relay` — standard location for third-party services. Owned by `relay` user. Git repo cloned here.

### Secret management
- **D-06:** Single `.env` file placed on FAT32 boot partition during SD card flash. `setup.sh` moves it from `/boot/firmware/.env` (or `/boot/.env`) to `/opt/river-relay/.env` with `chmod 600`, then deletes boot copy
- **D-07:** `.env` contains ALL secrets: relay app vars (STREAM_URL, RTSP_URL, DEMAND_API_URL, STATUS_API_URL, RELAY_BEARER_TOKEN) + Tailscale auth key (TAILSCALE_AUTHKEY). One file to manage.
- **D-08:** systemd loads .env via `EnvironmentFile=/opt/river-relay/.env` — relay code just reads `process.env`, no dotenv library needed
- **D-09:** Tailscale configured as exit node on the relay device — allows routing traffic through Pi to reach camera's local network (camera web UI, debugging) from anywhere via MagicDNS

### Deploy pipeline
- **D-10:** GitHub Actions workflow triggered on push to `main`, path-filtered to `packages/relay/**` and `packages/shared/**` — CSS or web-only changes do NOT trigger relay deploy
- **D-11:** GitHub Actions job SSHs into Pi over Tailscale (using Tailscale GitHub Action) and runs `configure.ts`
- **D-12:** `configure.ts` is the deploy script: git pull, bun install (if lockfile changed), copy systemd unit, daemon-reload, systemctl restart river-relay
- **D-13:** Rollback is manual: operator SSHs via Tailscale, runs `git checkout <commit>` + `systemctl restart river-relay`. Documented in README.

### Systemd service design
- **D-14:** `Type=simple`, `ExecStart=/usr/local/bin/bun run src/index.ts`, `WorkingDirectory=/opt/river-relay/packages/relay`
- **D-15:** `Restart=always`, `RestartSec=5` — always restart on any exit
- **D-16:** Restart rate limiting and failure counter reset timer — exact values at agent's discretion based on relay's 15s cooldown between crash restarts (Phase 07)
- **D-17:** Security hardening: `NoNewPrivileges=true`, `ProtectSystem=strict`, `ReadWritePaths=/opt/river-relay` — moderate sandboxing, won't interfere with Bun or ffmpeg
- **D-18:** Systemd unit file lives in repo at `packages/relay/config/river-relay.service` — `configure.ts` copies it to `/etc/systemd/system/` on deploy

### Agent's Discretion
- Restart rate limit values (StartLimitBurst, StartLimitIntervalSec) and timer reset interval
- Exact Tailscale setup flags beyond `--authkey` and `--advertise-exit-node`
- Git clone strategy during setup.sh (HTTPS vs SSH, sparse checkout vs full)
- Whether configure.ts checks for lockfile changes before running bun install
- systemd timer implementation details for failure counter reset
- Network block definitions in `packages/relay/config/` (DEPL-07)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Deployment requirements
- `.planning/REQUIREMENTS.md` §Relay Deployment — DEPL-01 through DEPL-09 requirement definitions
- `.planning/ROADMAP.md` §Phase 09 — Success criteria and phase goal

### Relay service context
- `packages/relay/package.json` — Bun scripts (dev, start, build), dependencies
- `packages/relay/.env.example` — Current env var list (5 vars: STREAM_URL, RTSP_URL, DEMAND_API_URL, RELAY_BEARER_TOKEN, STATUS_API_URL missing from example)
- `packages/relay/src/index.ts` — Entry point, reads config from process.env, has TODO for Phase 09 .env loading

### Architecture context
- `.planning/PROJECT.md` — Pi OS Lite + bash setup script decision, Tailscale for remote access, .env on boot partition
- `.planning/STATE.md` §Key Decisions — Bun.spawn for ffmpeg, 15s cooldown, SIGTERM+SIGKILL fallback

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/relay/package.json`: Has `start` script (`bun run src/index.ts`) — systemd ExecStart mirrors this
- `packages/relay/.env.example`: Template for env vars, needs STATUS_API_URL added and TAILSCALE_AUTHKEY added for deployment
- `packages/relay/src/index.ts`: Already reads process.env for all config — no code changes needed for systemd EnvironmentFile approach

### Established Patterns
- Bun workspaces: monorepo with `packages/web`, `packages/relay`, `packages/shared` — deploy must respect this structure
- TypeScript via Bun: no transpilation needed, `bun run src/index.ts` works directly
- `@river-stream/shared` workspace dependency — `bun install` from repo root resolves workspace links

### Integration Points
- `packages/relay/config/` — NEW: directory for systemd unit file and network block definitions
- `packages/relay/scripts/setup.sh` — NEW: one-time OS provisioning script
- `packages/relay/scripts/configure.ts` — NEW: idempotent app-level config script (deploy target)
- `.github/workflows/deploy-relay.yml` — NEW: GitHub Actions workflow for path-filtered deploy

</code_context>

<specifics>
## Specific Ideas

- Unattended-upgrades explicitly excluded — operator manages updates manually via Tailscale SSH to avoid surprise reboots on a headless streaming device
- Exit node on Tailscale is specifically for accessing the camera's local network (camera web UI) for debugging — not just SSH to the Pi
- Path filtering on GitHub Actions is deliberate cost control — only relay-relevant changes trigger a deploy, not every commit to the repo
- The relay admin web UI idea (Bun.serve with rollback button, accessible via MagicDNS from phone) is appealing but deferred to keep this phase focused on core deployment infrastructure

</specifics>

<deferred>
## Deferred Ideas

- **Relay admin web UI** — Bun.serve health/admin endpoint on Pi accessible via Tailscale MagicDNS. Would provide rollback button, status dashboard, restart control from phone browser. Noted for future enhancement.
- **API-fetched secrets on first boot** — ENHA-03 in REQUIREMENTS.md. One-time device token exchanged for .env via Worker endpoint. More secure than boot partition file but adds complexity.
- **Cloudflare Tunnel integration** — ENHA-01 in REQUIREMENTS.md. Sub-second stream start latency upgrade from polling.

</deferred>

---

*Phase: 09-relay-deployment*
*Context gathered: 2026-04-07*
