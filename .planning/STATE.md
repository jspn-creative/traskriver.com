---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: On-Demand Streaming
status: in_progress
stopped_at: Planning recovery and phase status correction
last_updated: "2026-04-07T23:24:00.000Z"
last_activity: 2026-04-07 — Reset Phase 05/06/07 to planned (not started)
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 8
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-19 after v3.0 milestone started)

**Core value:** Reliably deliver a continuous, high-quality livestream to authenticated users.
**Current focus:** v3.0 On-Demand Streaming — demand-driven relay streaming with monorepo restructure

## Phase Progress

| Phase                    | Status       | Goal                                                               |
| ------------------------ | ------------ | ------------------------------------------------------------------ |
| 05. Monorepo Restructure | Not started  | Devs work on web + relay in single repo with shared types          |
| 06. Demand API           | Not started  | Worker endpoints for demand registration and relay polling         |
| 07. Relay Service        | Not started  | TypeScript polling loop + ffmpeg state machine with crash recovery |
| 08. Stream UX            | Not started  | Demand-aware UI states: starting, live, ended, unavailable         |
| 09. Relay Deployment     | Not started  | Pi provisioning, systemd, Tailscale, deploy pipeline               |

## Current Position

Phase: 05 — Monorepo Restructure (Planned)
Plan: 00/03 (not started)
Status: v3.0 planning artifacts recovered; implementation has not started
Last activity: 2026-04-07 — Reset Phase 05/06/07 to planned state

```
[░░░░░░░░░░] 0%
```

## Pending Todos

_None_

## Accumulated Context

- SvelteKit app on Cloudflare Workers — env vars via `$env/dynamic/private`
- Stream delivery via Cloudflare Stream; HLS manifest URL signed per request via RS256 JWT (Web Crypto)
- CF Stream "Require Signed URLs" enabled — plain URLs return 401
- Page shell renders immediately; VideoPlayer isolated in nested `<svelte:boundary>` scoped to `absolute inset-0`
- Authentication is open (all visitors auto-authenticated) — paywall enforcement deferred
- Monorepo research: Bun workspaces only (no Turborepo) — 2 packages don't justify Turbo overhead
- Polling research: setTimeout chaining, single `stream-demand` KV key, read-before-write with 30s threshold
- Deployment research: Pi OS Lite + bash setup script + Tailscale + volatile journald
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

## Last Session
- **Stopped at:** Planning recovery and phase status correction
- **Updated:** 2026-04-07
