---
phase: 07-relay-service
verified: 2026-04-08T02:28:53Z
status: passed
score: 16/16 must-haves verified
human_verification:
  - test: "End-to-end RTSP→RTMPS start"
    expected: "With valid camera/API creds, relay reaches live after demand=true and stable confirm window"
    why_human: "Requires real camera source, ffmpeg runtime, and reachable Worker/Cloudflare endpoints"
  - test: "Network-partition safety stop window"
    expected: "Relay stops stream after configured consecutive poll failures (~5 min default)"
    why_human: "Requires controlled network failure simulation against live runtime"
  - test: "Remote health visibility"
    expected: "GET /health reachable via relay host address/Tailscale hostname and returns current state snapshot"
    why_human: "Requires deployed host networking and remote access path"
---

# Phase 07: Relay Service Verification Report

**Phase Goal:** Build relay service core and ffmpeg runtime wiring for demand-driven streaming with health/status reporting.  
**Verified:** 2026-04-08T02:28:53Z  
**Status:** passed  
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                             | Status     | Evidence                                                                                                    |
| --- | ----------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | State machine enforces valid transitions and rejects invalid ones | ✓ VERIFIED | `packages/relay/src/state-machine.ts` transition map + invalid transition warning path                      |
| 2   | Every state transition is logged with from/to/reason/timestamp    | ✓ VERIFIED | `log.state(...)` + `TransitionEvent.timestamp` in `packages/relay/src/state-machine.ts`                     |
| 3   | Poller calls demand API with bearer auth and timeout              | ✓ VERIFIED | `fetch(... Authorization: Bearer ..., AbortSignal.timeout(...))` in `packages/relay/src/poller.ts`          |
| 4   | Poller tracks consecutive failures and returns count              | ✓ VERIFIED | `consecutiveFailures` increment/reset and return in `packages/relay/src/poller.ts`                          |
| 5   | Status reporter POSTs state updates with bearer auth              | ✓ VERIFIED | `fetch(statusApiUrl, { method: 'POST', ... })` in `packages/relay/src/status-reporter.ts`                   |
| 6   | Relay starts ffmpeg when entering demand-driven start path        | ✓ VERIFIED | `sm.transition('starting', 'demand detected')` then `await ffmpeg.start()` in `packages/relay/src/index.ts` |
| 7   | Relay confirms live only after stability window                   | ✓ VERIFIED | `liveConfirmMs` deadline loop + `sm.transition('live', 'ffmpeg stable after live confirm')`                 |
| 8   | Relay logs ffmpeg stderr tail on failures                         | ✓ VERIFIED | stderr ring buffer + `log.error(...stderr tail...)` in `packages/relay/src/ffmpeg.ts`                       |
| 9   | Relay exits early if ffmpeg missing from PATH                     | ✓ VERIFIED | `Bun.which('ffmpeg')` guard + `process.exit(1)` in `packages/relay/src/index.ts`                            |
| 10  | Optional health endpoint exists via Bun.serve                     | ✓ VERIFIED | `startHealthServer` with `Bun.serve` and `GET /health` in `packages/relay/src/health-server.ts`             |
| 11  | Relay stops ffmpeg with SIGTERM and SIGKILL fallback              | ✓ VERIFIED | `kill('SIGTERM')` + 10s `kill('SIGKILL')` fallback in `packages/relay/src/ffmpeg.ts`                        |
| 12  | Crash recovery follows valid cooldown paths                       | ✓ VERIFIED | `ffmpeg.onExit` handling for `starting`/`live` to cooldown flow in `packages/relay/src/index.ts`            |
| 13  | Relay retries after cooldown if demand still exists               | ✓ VERIFIED | cooldown branch to `idle`, then next poll cycle can restart in `packages/relay/src/index.ts`                |
| 14  | Relay safety-stops on failureThreshold consecutive poll failures  | ✓ VERIFIED | `result.consecutiveFailures >= config.failureThreshold` branch in `packages/relay/src/index.ts`             |
| 15  | Main loop uses setTimeout chaining                                | ✓ VERIFIED | `scheduleTick()` + `setTimeout(tick, config.pollIntervalMs)`; no `setInterval` usage                        |
| 16  | State transitions are reported for remote status debugging        | ✓ VERIFIED | `sm.onTransition(async ...)` + `reporter.report(...)` wiring in `packages/relay/src/index.ts`               |

**Score:** 16/16 truths verified

### Required Artifacts

| Artifact                                | Expected                                  | Status     | Details                                                                   |
| --------------------------------------- | ----------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| `packages/relay/src/state-machine.ts`   | Transition validation + transition events | ✓ VERIFIED | Exists, substantive logic, wired from `index.ts`                          |
| `packages/relay/src/poller.ts`          | Demand polling client + failure tracking  | ✓ VERIFIED | Exists, substantive logic, instantiated/used in tick loop                 |
| `packages/relay/src/status-reporter.ts` | Relay status POST client                  | ✓ VERIFIED | Exists, substantive logic, called on transitions and shutdown             |
| `packages/relay/src/logger.ts`          | Structured relay logger                   | ✓ VERIFIED | Exists, used across modules for info/warn/error/debug/state               |
| `packages/relay/src/ffmpeg.ts`          | ffmpeg manager lifecycle + diagnostics    | ✓ VERIFIED | Exists, substantive spawn/stop/onExit/stderr handling, wired in main loop |
| `packages/relay/src/health-server.ts`   | Optional health HTTP service              | ✓ VERIFIED | Exists, substantive `Bun.serve` handler, wired in `run()`                 |
| `packages/relay/src/index.ts`           | Main runtime wiring and policies          | ✓ VERIFIED | Exists, substantive orchestration of all relay modules                    |
| `packages/relay/.env.example`           | Runtime env documentation                 | ✓ VERIFIED | Exists, includes required + optional relay vars                           |

### Key Link Verification

| From                                    | To                                      | Via                                     | Status | Details                                       |
| --------------------------------------- | --------------------------------------- | --------------------------------------- | ------ | --------------------------------------------- |
| `packages/relay/src/state-machine.ts`   | `@river-stream/shared`                  | `RelayInternalState` import             | WIRED  | Type import present                           |
| `packages/relay/src/poller.ts`          | `/api/stream/demand`                    | `fetch(config.demandApiUrl)`            | WIRED  | GET + bearer + timeout                        |
| `packages/relay/src/status-reporter.ts` | `/api/relay/status`                     | `fetch(config.statusApiUrl)`            | WIRED  | POST + JSON payload + bearer                  |
| `packages/relay/src/index.ts`           | `packages/relay/src/state-machine.ts`   | state orchestration                     | WIRED  | Import + transitions in loop                  |
| `packages/relay/src/index.ts`           | `packages/relay/src/poller.ts`          | demand polling each cycle               | WIRED  | Import + `await poller.poll()`                |
| `packages/relay/src/index.ts`           | `packages/relay/src/ffmpeg.ts`          | process start/stop + crash handling     | WIRED  | Import + `start/stop/onExit/isRunning` usage  |
| `packages/relay/src/index.ts`           | `packages/relay/src/status-reporter.ts` | status reporting on transition/shutdown | WIRED  | Import + `sm.onTransition` + shutdown reports |
| `packages/relay/src/ffmpeg.ts`          | `Bun.spawn`                             | subprocess runtime                      | WIRED  | `Bun.spawn([...ffmpeg args...])` present      |

### Requirements Coverage

| Requirement | Source Plan                      | Description                                    | Status      | Evidence                                                                            |
| ----------- | -------------------------------- | ---------------------------------------------- | ----------- | ----------------------------------------------------------------------------------- |
| RLAY-01     | `07-01-PLAN.md`, `07-02-PLAN.md` | Polling loop (~10s), timeout, failure tracking | ✓ SATISFIED | `packages/relay/src/poller.ts`, `packages/relay/src/index.ts`                       |
| RLAY-02     | `07-01-PLAN.md`, `07-02-PLAN.md` | FSM lifecycle + transition logging             | ✓ SATISFIED | `packages/relay/src/state-machine.ts`, `packages/relay/src/logger.ts`               |
| RLAY-03     | `07-02-PLAN.md`                  | ffmpeg spawn RTSP→RTMPS + SIGTERM/SIGKILL stop | ✓ SATISFIED | `packages/relay/src/ffmpeg.ts`, stop path in `packages/relay/src/index.ts`          |
| RLAY-04     | `07-02-PLAN.md`                  | Relay obeys demand TTL (`shouldStream`)        | ✓ SATISFIED | demand result drives stop/start in `packages/relay/src/index.ts`                    |
| RLAY-05     | `07-02-PLAN.md`                  | Crash recovery with cooldown and retry         | ✓ SATISFIED | `ffmpeg.onExit` recovery + cooldown branch in `packages/relay/src/index.ts`         |
| RLAY-06     | `07-01-PLAN.md`, `07-02-PLAN.md` | Safety stop after consecutive poll failures    | ✓ SATISFIED | failureThreshold branch + `poller.resetFailures()` in `packages/relay/src/index.ts` |

All requirement IDs declared in plan frontmatter (`RLAY-01`..`RLAY-06`) are present in `.planning/REQUIREMENTS.md` and accounted for in implementation evidence.

### Anti-Patterns Found

| File                                  | Line | Pattern       | Severity | Impact                                             |
| ------------------------------------- | ---- | ------------- | -------- | -------------------------------------------------- |
| `packages/relay/src/health-server.ts` | 9    | `return null` | ℹ️ Info  | Intentional: disables health server when port <= 0 |

No blocker anti-patterns found (`TODO/FIXME/placeholder`, `setInterval`, `child_process`).

### Human Verification Required

Human verification approved by user on 2026-04-08.

### 1. End-to-end RTSP→RTMPS start

**Test:** Run relay with valid camera/API env vars and trigger demand=true.  
**Expected:** Relay transitions `idle -> starting -> live`; ffmpeg stays running and pushes to Cloudflare Stream.  
**Why human:** Requires live camera, network, and external endpoints.

### 2. Network-partition safety behavior

**Test:** While relay is live, block access to demand API long enough to exceed `failureThreshold`.  
**Expected:** Relay logs safety stop, transitions through stopping/idle, and ffmpeg process is not left running.  
**Why human:** Requires runtime fault injection in deployed environment.

### 3. Remote health visibility

**Test:** Query `/health` from another machine on same reachable network/Tailscale path.  
**Expected:** JSON snapshot with current state and timestamp updates over time.  
**Why human:** Requires host/network context unavailable to static verification.

### Gaps Summary

No code gaps found in must-have artifacts or key wiring. Automated verification passed for all declared phase must-haves and requirement IDs. Remaining validation is runtime/environmental.

---

_Verified: 2026-04-08T02:28:53Z_  
_Verifier: Claude (gsd-verifier)_
