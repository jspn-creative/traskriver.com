# Roadmap: River Stream

## Milestones

- ✅ **v1.0 MVP** — Phases 1-3 (shipped 2026-03-19)
- ✅ **v1.1 Signed URL Streaming** — Phase 4 (shipped 2026-03-19)
- ✅ **v2.0 Paywall** — Phases 01-04 (shipped 2026-03-20)
- 📋 **v3.0 On-Demand Streaming** — Phases 05-09 (planned)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-3) — SHIPPED 2026-03-19</summary>

- [x] Phase 1: Automated Auth (1/1 plan) — completed 2026-03-18
- [x] Phase 2: Serverless Media Streaming (2/2 plans) — completed 2026-03-18
- [x] Phase 3: Asset Security & Cleanup (1/1 plan) — completed 2026-03-19

Full archive: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Signed URL Streaming (Phase 4) — SHIPPED 2026-03-19</summary>

- [x] Phase 4: Signed URL Streaming (3/3 plans) — completed 2026-03-19

Full archive: `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v2.0 Paywall (Phases 01-04) — SHIPPED 2026-03-20</summary>

- [x] Phase 01: Automated Auth Skip Paywall (1/1 plan) — completed 2026-03-18
- [x] Phase 02: Serverless Media Streaming (2/2 plans) — completed 2026-03-18
- [x] Phase 03: Asset Security & Cleanup (1/1 plan) — completed 2026-03-19
- [x] Phase 04: Signed URL Streaming (3/3 plans) — completed 2026-03-19

Full archive: `.planning/milestones/v2.0-ROADMAP.md`

</details>

### 📋 v3.0 On-Demand Streaming (In Progress)

- [ ] **Phase 05: Monorepo Restructure** — Move SvelteKit to `/packages/web`, create `/packages/relay` and `packages/shared`, configure Bun workspaces
- [ ] **Phase 06: Demand API** — Worker endpoints for stream demand registration and relay polling, KV-backed state
- [ ] **Phase 07: Relay Service** — TypeScript polling loop with ffmpeg state machine, crash recovery, safety policies
- [ ] **Phase 08: Stream UX** — Demand-aware UI states: starting, live, ended, unavailable
- [ ] **Phase 09: Relay Deployment** — Pi provisioning, systemd service, Tailscale access, deploy pipeline

## Phase Details

### Phase 05: Monorepo Restructure

**Goal**: Developers can work on web and relay code in a single repo with shared types and unified tooling
**Depends on**: Nothing (first v3.0 phase)
**Requirements**: MONO-01, MONO-02, MONO-03, MONO-04
**Success Criteria** (what must be TRUE):

1. SvelteKit app runs from `/packages/web` with all existing functionality intact (dev server, CF Workers deploy)
2. Relay package at `/packages/relay` builds and runs TypeScript via Bun
3. Shared types imported from `@river-stream/shared` are consumed by both `/packages/web` and `/packages/relay` without build errors
4. `bun dev` from root runs both Vite dev server and relay process simultaneously
5. `wrangler deploy` from `/packages/web` context deploys to Cloudflare Workers successfully

**Plans**: 3 plans

Plans:

- [ ] 05-01-PLAN.md — Move SvelteKit to /packages/web, configure wrangler paths
- [ ] 05-02-PLAN.md — Create packages/shared (types) and packages/relay (service)
- [ ] 05-03-PLAN.md — Configure Bun workspaces at root, wire dev scripts, verify

### Phase 06: Demand API

**Goal**: The Worker has endpoints that register viewer demand and serve demand state to the relay, with relay status reporting back to KV
**Depends on**: Phase 05 (shared types for API response shapes, `/packages/web` context for Worker endpoints)
**Requirements**: DEMA-01, DEMA-02, DEMA-03
**Success Criteria** (what must be TRUE):

1. Loading the SvelteKit page writes a demand timestamp to KV (with 30s throttling — no redundant writes within 30 seconds)
2. `GET /api/stream/demand` returns JSON with `shouldStream`, `demandTimestamp`, and `ttlSeconds` — authenticated via bearer token
3. Relay can write its state (`idle`/`starting`/`live`/`stopping`) to a `relay-status` KV key via a Worker endpoint
4. Demand auto-expires: `shouldStream` returns `false` when no page load has occurred for 5+ minutes

**Plans**: 3 plans

Plans:

- [ ] 06-01-PLAN.md — KV bindings, platform types, shared types revision (DEMA-01, DEMA-02, DEMA-03)
- [ ] 06-02-PLAN.md — Demand POST/GET endpoints + relay status endpoint (DEMA-01, DEMA-02, DEMA-03)
- [ ] 06-03-PLAN.md — Button-first page UX: demand on click, not page load (DEMA-01)

### Phase 07: Relay Service

**Goal**: A TypeScript service on the relay device polls for demand, starts/stops ffmpeg accordingly, and recovers from failures autonomously
**Depends on**: Phase 06 (demand API to poll, relay-status endpoint to write to)
**Requirements**: RLAY-01, RLAY-02, RLAY-03, RLAY-04, RLAY-05, RLAY-06
**Success Criteria** (what must be TRUE):

1. Relay polls `/api/stream/demand` every ~10s and starts ffmpeg (RTSP→RTMPS) when `shouldStream` is true
2. Relay stops ffmpeg (SIGTERM with SIGKILL fallback) when demand expires — no orphaned ffmpeg processes
3. Relay recovers from ffmpeg crashes: transitions through cooldown and restarts if demand still exists
4. Relay stops streaming after ~5 minutes of consecutive poll failures (network partition safety)
5. State machine logs every transition (`idle → starting → live → stopping → cooldown → idle`) for remote debugging

**Plans**: 2 plans

Plans:

- [ ] 07-01-PLAN.md — State machine, demand poller, status reporter, structured logger (RLAY-01, RLAY-02, RLAY-06)
- [ ] 07-02-PLAN.md — ffmpeg process manager, main loop wiring, crash recovery, safety policies (RLAY-01 through RLAY-06)

### Phase 08: Stream UX

**Goal**: Viewers see accurate, actionable stream status — they know when the stream is starting, live, ended, or unavailable, and can restart it
**Depends on**: Phase 06 (relay-status KV key), Phase 07 (relay writing status)
**Requirements**: STRX-01, STRX-02, STRX-03
**Success Criteria** (what must be TRUE):

1. Page shows "Starting stream..." when demand is fresh but stream isn't live yet (relay `idle` or `starting`)
2. Page shows "Stream ended — click to restart" when stream stops, and clicking it registers new demand and returns to "Starting stream..."
3. Page shows "Stream unavailable" when relay-status timestamp is stale (relay offline) — distinct from the "starting" state

**Plans**: TBD

### Phase 09: Relay Deployment

**Goal**: A fresh Pi can be provisioned from SD card flash to fully operational relay with one setup script, auto-recovers from failures, and is remotely manageable via Tailscale
**Depends on**: Phase 07 (relay code must exist to deploy)
**Requirements**: DEPL-01, DEPL-02, DEPL-03, DEPL-04, DEPL-05, DEPL-06, DEPL-07, DEPL-08, DEPL-09
**Success Criteria** (what must be TRUE):

1. Running `setup.sh` on a fresh Pi OS Lite installs all dependencies (Bun, ffmpeg, Tailscale), creates the relay user, and hardens the SD card (volatile journald, tmpfs, noatime, no swap)
2. `river-relay.service` starts the relay on boot, restarts on crash (with rate limiting), and the failure counter resets every 15 minutes so it always eventually recovers
3. Secrets are placed on the boot partition during flash and moved to `/opt/river-relay/.env` with `chmod 600` on first boot — boot copy deleted
4. Operator can SSH into the relay via Tailscale from anywhere, and can roll back to a previous version via `git checkout` + service restart
5. Pushing to `main` triggers deployment to the relay over Tailscale SSH via the idempotent Bun config script

**Plans**: TBD

## Progress

| Phase                          | Milestone | Plans Complete | Status       | Completed  |
| ------------------------------ | --------- | -------------- | ------------ | ---------- |
| 1. Automated Auth              | v1.0      | 1/1            | Complete     | 2026-03-18 |
| 2. Serverless Media Streaming  | v1.0      | 2/2            | Complete     | 2026-03-18 |
| 3. Asset Security & Cleanup    | v1.0      | 1/1            | Complete     | 2026-03-19 |
| 4. Signed URL Streaming        | v1.1      | 3/3            | Complete     | 2026-03-19 |
| 01. Auto Auth Skip Paywall     | v2.0      | 1/1            | Complete     | 2026-03-18 |
| 02. Serverless Media Streaming | v2.0      | 2/2            | Complete     | 2026-03-18 |
| 03. Asset Security & Cleanup   | v2.0      | 1/1            | Complete     | 2026-03-19 |
| 04. Signed URL Streaming       | v2.0      | 3/3            | Complete     | 2026-03-19 |
| 05. Monorepo Restructure       | v3.0      | 0/3            | Not started  | —          |
| 06. Demand API                 | v3.0      | 0/3            | Not started  | —          |
| 07. Relay Service              | v3.0      | 0/2            | Not started  | —          |
| 08. Stream UX                  | v3.0      | 0/?            | Not started  | —          |
| 09. Relay Deployment           | v3.0      | 0/?            | Not started  | —          |

---

_Roadmap updated: 2026-04-07 after planning recovery (v3.0 phases reset to planned state)_
