---
phase: 07-health-endpoint-shared-types-purge
plan: 01
subsystem: packages
tags: [refactor, types, shared-purge, CLEAN-04]
requires: []
provides:
  - 'packages/relay/src/types.ts: local relay types (DemandResponse, RelayInternalState, RelayStatusPayload, RelayConfig)'
  - 'packages/web/src/lib/types.ts: local web types (RelayState, DemandResponse, RelayStatusPayload, RelayStatusResponse, RELAY_STATUS_* consts)'
  - 'packages/shared/index.ts: empty public surface (export {})'
affects:
  - packages/relay
  - packages/web
  - packages/shared
tech-stack:
  added: []
  patterns:
    - 'Package-local types replace shared cross-package type surface'
key-files:
  created:
    - packages/relay/src/types.ts
    - packages/web/src/lib/types.ts
  modified:
    - packages/relay/src/poller.ts
    - packages/relay/src/state-machine.ts
    - packages/relay/src/status-reporter.ts
    - packages/relay/src/index.ts
    - packages/web/src/lib/index.ts
    - packages/web/src/routes/+page.svelte
    - packages/web/src/routes/api/relay/status/+server.ts
    - packages/web/src/routes/api/stream/demand/+server.ts
    - packages/shared/index.ts
decisions:
  - 'Duplicated DemandResponse and RelayStatusPayload across relay/web intentionally — both packages slated for phase-9 deletion, so DRY is not worth a new shared module.'
  - 'Switched relay/index.ts from `import { RelayConfig }` to `import type` — RelayConfig is interface-only, safe under verbatimModuleSyntax.'
metrics:
  duration: ~5m
  completed: 2026-04-22
---

# Phase 07 Plan 01: Shared Types Purge Summary

Re-homed every relay/demand/status symbol from `@traskriver/shared` into its owning package (`packages/relay/src/types.ts`, `packages/web/src/lib/types.ts`) and emptied `packages/shared/index.ts` to `export {}`, severing the cross-package type coupling so Phase 9 can delete `packages/shared` mechanically. Satisfies CLEAN-04.

## Tasks Completed

| Task | Name                                       | Commit    |
| ---- | ------------------------------------------ | --------- |
| 1    | Re-home relay types and update imports     | `a132b1f` |
| 2    | Re-home web types and update imports       | `2d08402` |
| 3    | Empty shared/index.ts and verify repo-wide | `09b7b99` |

## Verification

- `rg "from '@traskriver/shared'" packages/` → 0 matches
- `packages/shared/index.ts` contains only `export {};` (1 export line)
- `bun check` → exit 0 (4/4 packages green; `@traskriver/shared`, `@traskriver/relay`, `@traskriver/web`, `@traskriver/stream`)

## Deviations from Plan

None — plan executed exactly as written. `bun check` accepted `import type { RelayConfig }` on first run; no revert to non-type import needed.

## Self-Check: PASSED

- FOUND: `packages/relay/src/types.ts`
- FOUND: `packages/web/src/lib/types.ts`
- FOUND commit: `a132b1f`
- FOUND commit: `2d08402`
- FOUND commit: `09b7b99`
