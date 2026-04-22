---
phase: 07-health-endpoint-shared-types-purge
plan: 02
subsystem: packages/stream
tags: [supervisor, health, observability, fs-watch]
requirements: [STRM-08]
dependency_graph:
  requires:
    - packages/stream/src/supervisor.ts (Phase 6 supervisor baseline)
    - packages/stream/src/server.ts (HealthStatus type w/ codec_mismatch)
  provides:
    - HealthSnapshot type
    - Supervisor.getHealthSnapshot() accessor
    - SegmentWatcher helper
    - codecMismatch observable state (no process.exit)
  affects:
    - Plan 03 (HTTP /health handler will consume getHealthSnapshot)
tech_stack:
  added: []
  patterns:
    - fs.watch non-persistent wrapper for segment write detection
    - Rolling in-memory 1h restart window (Array + shift-on-prune)
    - Single canonical restart path via child 'exit' handler
key_files:
  created:
    - packages/stream/src/segment-watcher.ts
  modified:
    - packages/stream/src/supervisor.ts
decisions:
  - Removed process.exit from codec guard; Supervisor now holds codecMismatch state and lets ops observe via /health (07-RESEARCH OQ#1)
  - Stall branch no longer directly schedules restart; child 'exit' handler is the single canonical restart trigger (07-RESEARCH Pitfall 4)
  - child 'exit' handler skips scheduleRestart when state is codecMismatch (stay alive, no restart loop)
metrics:
  duration: 6m
  completed: 2026-04-22
  tasks: 2
  files: 2
---

# Phase 07 Plan 02: Supervisor Health Snapshot Summary

Supervisor now exposes a typed `HealthSnapshot` (status, rtspConnected, codec, lastSegmentWrittenAgoMs, restartsLast1h, uptimeMs), owns a `SegmentWatcher` over `HLS_DIR`, and surfaces codec mismatch as an observable `codecMismatch` state instead of calling `process.exit`.

## What Was Built

### Task 1 — `SegmentWatcher` helper

`packages/stream/src/segment-watcher.ts`: fs.watch wrapper over `HLS_DIR`, records `Date.now()` on any `.ts` filename event, exposes `getLastWriteAt(): number | null`. Non-persistent, explicit field declarations (erasableSyntaxOnly compliant).

Commit: `268b5da`

### Task 2 — Supervisor extensions

- Exported `HealthSnapshot` interface with exactly the 6 fields required by STRM-08.
- `State` union gained `{ kind: 'codecMismatch'; codec: string }`; `fatal` preserved for future paths.
- New private fields: `bootAt`, `restartTimestamps`, `lastCodec`, `segmentWatcher`.
- `getStatus()` maps `codecMismatch → 'codec_mismatch'`; rest unchanged.
- `getHealthSnapshot()` prunes restart window (>1h) on each call, reads watcher's `getLastWriteAt`, returns typed snapshot.
- Codec guard in `onPoll` no longer calls `process.exit`: sets `codecMismatch` state, stops polling, kills child, logs fatal.
- `child.on('exit')` handler skips `scheduleRestart` when state is `codecMismatch` (no restart storm after intentional kill).
- `scheduleRestart()` pushes `Date.now()` on entry (single canonical counting point).
- Stall branch in `onPoll` dropped its `.then(() => scheduleRestart())`; restart is now driven exclusively by the child 'exit' handler.
- `start()` constructs + starts `SegmentWatcher` after `spawnChild()` (HLS_DIR already mkdir'd).
- `shutdown()` calls `segmentWatcher?.stop()`.

Commit: `c6a6d89`

## Verification

- `bun check` → green.
- `rg "process.exit" packages/stream/src/supervisor.ts` → no matches.
- `rg "export interface HealthSnapshot" packages/stream/src/supervisor.ts` → 1 match.
- `rg "getHealthSnapshot|codecMismatch|restartTimestamps|SegmentWatcher" packages/stream/src/supervisor.ts` → 31 matches (≥6 required).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Skip `scheduleRestart` on codecMismatch in child 'exit' handler**

- **Found during:** Task 2
- **Issue:** Plan removed `process.exit` and added `void this.killChild()` in the codec-guard branch, but the existing `child.on('exit')` handler only early-returns on `intentionalStop` or `shuttingDown`. Without an extra guard, killing the child on codec mismatch would trigger `scheduleRestart()` → infinite loop of kill→restart→codec-mismatch.
- **Fix:** Added `if (this.state.kind === 'codecMismatch') return;` to `child.on('exit')`.
- **Files modified:** `packages/stream/src/supervisor.ts`
- **Commit:** `c6a6d89`

**2. [Rule 1 - Bug] fs.watch filename type narrowing**

- **Found during:** Task 1 (initial `bun check` failure)
- **Issue:** `typeof filename === 'string' ? filename : filename.toString()` — TS narrowed the else branch to `never`, rejecting `.toString()`.
- **Fix:** Replaced with `String(filename)`.
- **Files modified:** `packages/stream/src/segment-watcher.ts`
- **Commit:** `268b5da` (fixed before commit)

## Self-Check: PASSED

- `packages/stream/src/segment-watcher.ts` — FOUND
- `packages/stream/src/supervisor.ts` — FOUND
- Commit `268b5da` — FOUND
- Commit `c6a6d89` — FOUND
