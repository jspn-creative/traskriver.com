---
phase: 05-packages-stream-skeleton
plan: rollup
subsystem: infra
tags: [node22, hono, pino, zod, turbo, tsc]

requires:
  - phase: —
    provides: —
provides:
  - '@traskriver/stream workspace package: scaffold (01), src skeleton (02), verification (03)'
  - 'STRM-01 satisfied — build, boot, /health, fail-fast observable'
affects:
  - Phase 6 MediaMTX supervisor
  - Phase 7 /health expansion

tech-stack:
  added: 'hono, @hono/node-server, pino, zod, pino-pretty (dev), @types/node, typescript ^5.8 in packages/stream'
  patterns:
    - 'tsc emit + node --check; dev via node --experimental-strip-types --watch'
    - 'Relative imports with .ts specifiers + rewriteRelativeImportExtensions → .js in dist'

key-files:
  created:
    - packages/stream/** (see 05-01 + 05-02 summaries)
  modified:
    - package.json, turbo.json, bun.lock
    - .planning/codebase/STRUCTURE.md (05-02)

key-decisions:
  - 'HTTP: Hono + @hono/node-server (05-CONTEXT)'
  - 'HealthStatus union for forward-compat (starting | ready | degraded | codec_mismatch | fatal)'
  - 'Child logger via log.child({ component }) for Phase 6 tagging'

patterns-established:
  - 'Zod fail-fast to stderr + exit 1 before logger when env invalid'
  - 'SIGTERM/SIGINT → server.close() → process.exit(0)'

requirements-completed: [STRM-01]

duration: —
completed: 2026-04-20
---

# Phase 5 rollup: `packages/stream` Skeleton

**Node 22 ESM service package with zod env, Pino logging, Hono `/health`, tsc emit verified by `node --check` and smoke tests — STRM-01 closed.**

## Plans

| Plan  | Summary                                                                           |
| ----- | --------------------------------------------------------------------------------- |
| 05-01 | Workspace scaffold, tsconfig, turbo outputs, README                               |
| 05-02 | config.ts, logger.ts, server.ts, index.ts — boot + signals                        |
| 05-03 | Build/smoke/fail-fast/`bun check` verification (no new `packages/stream` sources) |

## Files created (phase)

- `packages/stream/package.json`, `tsconfig.json`, `.gitignore`, `README.md`
- `packages/stream/src/config.ts`, `logger.ts`, `server.ts`, `index.ts`
- Root: `workspaces` + `turbo.json` + lockfile updates

## Decisions locked

- **HTTP:** Hono + `@hono/node-server` (see `05-CONTEXT.md`, `05-RESEARCH.md` Standard Stack).
- **Build:** `tsc` → `dist/`; dev: `node --experimental-strip-types --watch src/index.ts`.
- **`/health`:** `{ status: "starting" }`; headers `Content-Type: application/json`, `Cache-Control: no-store`; `HealthStatus` union reserved for Phase 6/7.
- **Logging:** Pino JSON prod; `pino-pretty` when `NODE_ENV !== production`.

## Forward-compat for Phase 6+

- `HealthStatus` union; Phase 7 fills payload.
- `log.child({ component })` for supervisor / watchdog tags.
- Graceful `server.close()` hook for later MediaMTX teardown (STRM-02).

## Deviations (phase-level)

- **05-03:** tsc emit uses double quotes in `dist/*.js` import specifiers; plan grep used single quotes — verification adjusted (see `05-03-SUMMARY.md`).
- **05-03:** Smoke fail-fast script: use **bash** for `set -e` + failing `$(node …)` capture (zsh exits early).

## Next

Phase 6 — MediaMTX supervisor + RTSP ingest (ROADMAP).
