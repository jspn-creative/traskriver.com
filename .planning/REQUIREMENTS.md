# Requirements: River Stream v3.0

**Defined:** 2026-03-19
**Core Value:** Reliably deliver a continuous, high-quality livestream to authenticated users.

## v3.0 Requirements

Requirements for on-demand streaming milestone. Each maps to roadmap phases.

### Monorepo

- [ ] **MONO-01**: Repository restructured with `/packages/web` (SvelteKit) and `/packages/relay` (TypeScript relay service) as Bun workspace packages
- [ ] **MONO-02**: Shared types package (`packages/shared`) provides TypeScript types consumed by both `/packages/web` and `/packages/relay` (e.g., demand API response shape)
- [ ] **MONO-03**: Bun workspaces configured so `bun run dev` runs Vite dev server and relay ffmpeg script simultaneously for local development
- [ ] **MONO-04**: Cloudflare Workers deployment works correctly from `/packages/web` context (wrangler paths, dashboard root directory updated)

### Demand API

- [ ] **DEMA-01**: SvelteKit page load registers stream demand by writing a timestamp to Cloudflare KV (`stream-demand` key) with read-before-write throttling (30s threshold) and `expirationTtl: 600`
- [ ] **DEMA-02**: Worker endpoint `GET /api/stream/demand` returns JSON with `shouldStream`, `demandTimestamp`, `ttlSeconds` — authenticated via bearer token (shared secret)
- [ ] **DEMA-03**: Relay writes its state to a separate KV key (`relay-status`) via a Worker endpoint, reporting current state (`idle`, `starting`, `live`, `stopping`) and timestamp

### Relay Service

- [ ] **RLAY-01**: TypeScript polling loop using `setTimeout` chaining polls `/api/stream/demand` every ~10 seconds, with 8s request timeout and consecutive failure tracking
- [ ] **RLAY-02**: State machine manages ffmpeg lifecycle: `idle → starting → live → stopping → cooldown → idle` with transition logging
- [ ] **RLAY-03**: Relay spawns ffmpeg to pull RTSP from IP camera and push RTMPS to Cloudflare Stream when demand is active; sends SIGTERM (with 10s SIGKILL fallback) when demand expires
- [ ] **RLAY-04**: Relay stops streaming after 5 minutes of no new demand requests (demand TTL expired) — timeout logic lives entirely in the Worker/KV, relay just obeys `shouldStream`
- [ ] **RLAY-05**: Relay recovers from ffmpeg crashes (unexpected exit during `starting` or `live` state) by transitioning through cooldown and restarting if demand still exists
- [ ] **RLAY-06**: Relay stops streaming after N consecutive poll failures (~5 min) as a safety policy to avoid indefinite streaming during network partitions

### Stream UX

- [ ] **STRX-01**: Web app reads `relay-status` KV key and shows "Starting stream..." when relay state is `starting` or when demand is fresh but relay is `idle`
- [ ] **STRX-02**: Web app detects stream end (HLS manifest failure, relay status changes to `idle`/`stopping`) and shows "Stream ended — click to restart" prompt that registers a new demand
- [ ] **STRX-03**: Web app shows distinct "Stream unavailable" state when relay-status indicates offline (stale status timestamp) vs "Starting stream..." when relay is responsive but stream isn't live yet

### Relay Deployment

- [ ] **DEPL-01**: Bash setup script (`packages/relay/scripts/setup.sh`) runs once on fresh Pi OS Lite: installs Bun, ffmpeg, Tailscale (with auth key), creates `relay` user, disables swap, configures volatile journald, tmpfs mounts, noatime, unattended-upgrades
- [ ] **DEPL-02**: systemd service file (`river-relay.service`) with `Type=simple`, `Restart=always`, `RestartSec=5`, rate-limited restarts (10/5min), security hardening (`NoNewPrivileges`, `ProtectSystem=strict`), `EnvironmentFile` for secrets
- [ ] **DEPL-03**: systemd timer resets relay failure counter every 15 minutes so relay always eventually recovers after transient failures
- [ ] **DEPL-04**: `.env` file placed on FAT32 boot partition during image flash, moved to `/opt/river-relay/.env` with `chmod 600` on first boot, boot copy deleted
- [ ] **DEPL-05**: Tailscale configured as exit node on the relay device for remote network access
- [ ] **DEPL-06**: Idempotent Bun config script (`packages/relay/scripts/configure.ts`) handles app-level setup: installs dependencies, syncs relay code from git, updates systemd service, restarts service — safe to re-run after `.env` or code changes
- [ ] **DEPL-07**: Relay config stored as infra-as-code in the repo (`packages/relay/config/`) including network block definitions; Bun config script reads and applies config
- [ ] **DEPL-08**: GitHub webhook triggers deploy to relay via Tailscale — pushes to `main` invoke the Bun config script on the Pi over SSH
- [ ] **DEPL-09**: Rollback capability via Tailscale SSH — operator can SSH into relay and revert to previous version quickly (e.g., `git checkout` + service restart)

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Paywall

- **PAY-01**: Implement final paywall logic based on client's chosen model — one-time purchase or subscription
- **PAY-02**: Validate Stripe success session IDs to ensure they are single-use
- **PAY-03**: Implement Stripe webhooks for subscription lifecycle management

### Enhancements

- **ENHA-01**: Cloudflare Tunnel integration for sub-second stream start latency (upgrade from polling)
- **ENHA-02**: Fallback AP mode on relay for on-site WiFi credential changes without SSH
- **ENHA-03**: API-fetched secrets on first boot (one-time device token → Worker returns .env)

## Out of Scope

| Feature                        | Reason                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| Paywall enforcement            | Blocked on client payment model decision (one-time vs. subscription)                  |
| Client-side viewer heartbeat   | Not needed — relay timeout driven by demand requests only                             |
| Cloudflare Tunnel              | Pure polling sufficient for v3.0; tunnel is a future latency optimization             |
| Custom Pi image (pi-gen)       | Overkill for single device — bash setup script achieves same result                   |
| Ansible playbook               | Overkill for single device — migrate if scaling to multiple relay sites               |
| Read-only root filesystem      | Volatile journald + tmpfs + noatime achieves ~95% write reduction; RO adds complexity |
| Fallback AP mode               | Ethernet preferred; WiFi creds changed via Tailscale SSH if needed                    |
| Accurate viewer counting in KV | KV has no atomic increment; use CF Stream `/views` endpoint for viewer counts         |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase    | Status  |
| ----------- | -------- | ------- |
| MONO-01     | Phase 05 | Pending |
| MONO-02     | Phase 05 | Pending |
| MONO-03     | Phase 05 | Pending |
| MONO-04     | Phase 05 | Pending |
| DEMA-01     | Phase 06 | Pending |
| DEMA-02     | Phase 06 | Pending |
| DEMA-03     | Phase 06 | Pending |
| RLAY-01     | Phase 07 | Pending |
| RLAY-02     | Phase 07 | Pending |
| RLAY-03     | Phase 07 | Pending |
| RLAY-04     | Phase 07 | Pending |
| RLAY-05     | Phase 07 | Pending |
| RLAY-06     | Phase 07 | Pending |
| STRX-01     | Phase 08 | Pending |
| STRX-02     | Phase 08 | Pending |
| STRX-03     | Phase 08 | Pending |
| DEPL-01     | Phase 09 | Pending |
| DEPL-02     | Phase 09 | Pending |
| DEPL-03     | Phase 09 | Pending |
| DEPL-04     | Phase 09 | Pending |
| DEPL-05     | Phase 09 | Pending |
| DEPL-06     | Phase 09 | Pending |
| DEPL-07     | Phase 09 | Pending |
| DEPL-08     | Phase 09 | Pending |
| DEPL-09     | Phase 09 | Pending |

**Coverage:**

- v3.0 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0 ✓

---

_Requirements defined: 2026-03-19_
_Last updated: 2026-03-19 after roadmap phase mapping (25/25 mapped)_
