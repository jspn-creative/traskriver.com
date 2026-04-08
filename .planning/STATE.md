---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: On-Demand Streaming
status: unknown
stopped_at: Completed 08-03-PLAN.md
last_updated: "2026-04-08T16:07:28.390Z"
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 13
  completed_plans: 13
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Reliably deliver a continuous, high-quality livestream to authenticated users.
**Current focus:** Phase 08 — stream-ux

## Phase Progress

| Phase                    | Status      | Goal                                                               |
| ------------------------ | ----------- | ------------------------------------------------------------------ |
| 05. Monorepo Restructure | Complete    | Devs work on web + relay in single repo with shared types          |
| 06. Demand API           | Complete    | Worker endpoints for demand registration and relay polling         |
| 07. Relay Service        | Complete    | TypeScript polling loop + ffmpeg state machine with crash recovery |
| 08. Stream UX            | Complete    | Demand-aware UI states: starting, live, ended, unavailable         |
| 09. Relay Deployment     | Complete    | Pi provisioning, systemd, Tailscale, deploy pipeline               |

## Current Position

Phase: 08 (stream-ux) — COMPLETE
Plan: 3 of 3

## Pending Todos

_None_

## Accumulated Context

- SvelteKit in `packages/web` on Cloudflare Workers — env via `$env/dynamic/private`
- Stream delivery via Cloudflare Stream; HLS signed per request (RS256 JWT)
- Root `bun dev`: concurrently runs web Vite + relay stub; `bun run build` / `bun check` use **Turbo** across packages
- Monorepo: Bun workspaces + Turbo (orchestration/caching); legacy `scripts/push-stream.ts` still at repo root
- Polling research: setTimeout chaining, single `stream-demand` KV key, read-before-write with 30s threshold
- Relay state machine: `idle → starting → live → stopping → cooldown → idle`

### Key Decisions (v3.0)

| Decision                                       | Rationale                                                    |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `git mv` for monorepo migration                | Preserves file history with `--follow`, minimal path changes |
| Single KV key `stream-demand`                  | Binary demand question; no need to enumerate viewers         |
| Read-before-write with 30s threshold           | Eliminates KV 429 errors, reduces write costs                |
| Bearer token auth for demand API               | Simple, sufficient for single relay device                   |
| setTimeout chaining (not setInterval)          | No drift, no overlap, backpressure-aware                     |
| Relay status in KV + CF lifecycle endpoint     | Fast feedback + accurate stream readiness confirmation       |
| Pi OS Lite + bash setup script                 | Lowest complexity, easy to iterate, version-controlled       |
| Tailscale for remote access                    | Outbound-only, works behind any NAT, free tier sufficient    |
| `.env` on boot partition                       | Simple for single device; deleted after first boot           |
| RelayState: public 4-state vs internal 5-state | Public excludes stopping/cooldown per CONTEXT.md             |
| RelayStatusPayload.state: string not enum      | No enum validation — relay may evolve states freely          |
| statusApiUrl added to RelayConfig              | Relay needs endpoint URL for status POST reporting           |
| Demand POST is public (no auth)                | Auth deferred to Stripe/paywall phase                        |
| No expirationTtl on demand KV key              | Expiry calculated from timestamp age vs 5-min window         |
| Relay status KV TTL 120s as heartbeat          | Stale entry = relay offline; automatic cleanup               |
| Button-gated stream loading                    | getStreamInfo() only runs after user clicks "Start stream"   |
| Map<State, Set<State>> for transitions         | O(1) lookup, exhaustive transition validation                |
| StatusReporter never throws                    | Status failures are non-fatal warnings, not errors           |
| DemandPoller tracks consecutive failures       | Exposed via PollResult for safety stop logic in Plan 02      |
| Bun.spawn + exited promise for ffmpeg          | No Node.js child_process; native Bun subprocess management   |
| SIGTERM + 10s SIGKILL fallback for ffmpeg stop | Ensures ffmpeg never becomes zombie process                  |
| 15s cooldown before restart after ffmpeg crash | Prevents tight crash loops                                   |
| starting→stopping allowed for demand expiry  | Matches main-loop stop path while ffmpeg still in starting   |
| `.env.example` un-ignored in relay package     | `.env.*` ignore would block versioned env template           |
| systemd restart guard 10/300 + 15m reset timer | Prevents permanent start-limit lockout while avoiding tight restart loops |
| Bun at `/usr/local/bin/bun` in setup            | Keeps service ExecStart stable across root/user environments |
| ff-only pull + diff-based unit sync in configure.ts | Makes deploy script idempotent and safe to re-run after code/config changes |
| relay deploy CI path-filtered to relay/shared only | Avoids unnecessary Pi deploys from unrelated web-only commits |
| Public GET /api/relay/status | Web app can poll relay status without relay bearer token |
| Shared relay-status TTL/stale constants | API and frontend use one source of truth for stale detection |
| Stream UX state driven by relay status + player events | Replaces fake timers with accurate lifecycle states (`starting/live/ended/unavailable`) |
| Starting timeout excludes stale-relay windows | Prevents false timeout errors while relay heartbeat is offline |
| Unavailable CTA remains clickable | Users can retry stream start while relay is offline (`buttonDisabled` excludes `unavailable`) |

## Last Session

- **Stopped at:** Completed 08-03-PLAN.md
- **Updated:** 2026-04-08
