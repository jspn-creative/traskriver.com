---
phase: quick
plan: 260408-cz3
subsystem: web-ui
tags: [bugfix, ux, svelte, PassDetailsPanel, unavailable-state]
dependency_graph:
  requires: []
  provides: [corrected-isStarting-derived]
  affects: [PassDetailsPanel.svelte]
tech_stack:
  added: []
  patterns: [svelte-derived-state]
key_files:
  created: []
  modified:
    - packages/web/src/lib/components/PassDetailsPanel.svelte
decisions:
  - "isStarting scoped to phase === 'starting' only — unavailable is a retry-CTA state, not a loading state"
metrics:
  duration: "5 minutes"
  completed: "2026-04-08T16:23:16Z"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 260408-cz3: Fix PassDetailsPanel UX — Spinner Persists in Unavailable State

**One-liner:** Single-line derived fix — `unavailable` removed from `isStarting` so the retry CTA renders primary-colored and clickable with no spinner.

## What Was Done

The `isStarting` derived on line 27 of `PassDetailsPanel.svelte` incorrectly included `phase === 'unavailable'`, which caused three downstream expressions to treat the unavailable state like an in-progress loading state:

1. **Spinner** (`{#if isStarting || demandLoading}`) — showed a spinning SVG, obscuring the retry CTA text
2. **Button color** (`isStarting || demandLoading ? 'bg-secondary/90' : ...`) — rendered a muted secondary background instead of `bg-primary`
3. **Pulse message** (`{#if isStarting && demandRegistered}`) — showed "Live feed connecting" text during the unavailable phase

The fix was a single-character reduction: `phase === 'starting' || phase === 'unavailable'` → `phase === 'starting'`.

`buttonDisabled` already correctly excluded `unavailable` (no change needed). `ctaLabel` already had a dedicated `unavailable` branch showing "Try starting stream" (no change needed).

## Tasks

| Task | Name | Commit | Files |
| --- | --- | --- | --- |
| 1 | Remove unavailable from isStarting derived | a02dfcf | packages/web/src/lib/components/PassDetailsPanel.svelte |

## Verification

`bun check` passed with 0 errors and 0 warnings across all 3 packages.

Post-fix state logic:
- `unavailable`: `isStarting=false`, `buttonDisabled=false` → `bg-primary` button, cursor-pointer, no spinner, no pulse message
- `starting`: `isStarting=true`, `buttonDisabled=true` → `bg-secondary/90` button, spinner, pulse message (unchanged)
- `demandLoading=true`: spinner and secondary/90 still fire via the `demandLoading` branch (unchanged)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `packages/web/src/lib/components/PassDetailsPanel.svelte` modified (line 27)
- [x] Commit a02dfcf exists
- [x] `bun check` passed: 0 errors, 0 warnings
- [x] `isStarting` derived contains only `phase === 'starting'`

## Self-Check: PASSED
