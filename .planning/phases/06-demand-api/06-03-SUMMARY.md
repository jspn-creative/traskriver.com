---
phase: 06-demand-api
plan: 03
subsystem: ui
tags: [svelte, demand, button-gate]

requires:
  - phase: 06-demand-api
    provides: Plans 01–02 API and types
provides:
  - Button-first stream start; demand POST before `getStreamInfo`
affects: [08-stream-ux]

tech-stack:
  added: []
  patterns: [gate async boundary on client demand flag]

key-files:
  created: []
  modified:
    - packages/web/src/routes/+page.svelte
    - packages/web/src/lib/components/PassDetailsPanel.svelte

key-decisions:
  - Header + shell outside `svelte:boundary`; player only after `demandRegistered`
  - PassDetailsPanel: Start stream CTA + loading/error for demand POST

patterns-established:
  - `registerDemand` → POST → `handleBeginConnection` → boundary loads stream

requirements-completed: [DEMA-01]

duration: —
completed: 2026-04-07
---

# Phase 06: Demand API — Plan 03 Summary

**Home page gates stream fetch behind “Start stream” / demand POST; refresh resets to idle.**

## Accomplishments

- `demandRegistered` / `demandLoading` / `demandError` + `registerDemand` fetch to `/api/stream/demand`
- Pre-demand: poster + blur, no `VideoPlayer` or `getStreamInfo`
- PassDetailsPanel wired to demand flow with loading and error line

## Checkpoint (human-verify)

- Manual smoke: `bun dev`, button → player, refresh → button; curl POST/GET demand and relay status with `.dev.vars` / wrangler dev for KV

## Self-Check: PASSED

- Grep criteria from plan; `+page.server.ts` unchanged
