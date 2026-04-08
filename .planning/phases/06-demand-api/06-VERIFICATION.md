---
phase: 06-demand-api
verified: 2026-04-07T00:00:00Z
status: passed
score: must-haves verified (static + bun check/lint); full KV smoke optional with .dev.vars / wrangler
re_verification: false
---

# Phase 06: Demand API — Verification

**Goal:** Worker endpoints for demand registration and relay polling, KV-backed state; button-gated stream start.

## Must-haves

| Source | Check | Status |
|--------|--------|--------|
| 06-01 | `wrangler.jsonc` has `kv_namespaces` + `RIVER_KV` | ✓ |
| 06-01 | `app.d.ts` has `App.Platform` + `KVNamespace` + token + window | ✓ |
| 06-01 | Shared types: `RelayState` 4-state, `RelayInternalState`, `RelayStatusPayload` | ✓ |
| 06-02 | `api/stream/demand` exports POST + GET, `stream-demand`, `DEMAND_WINDOW_SECONDS` | ✓ |
| 06-02 | `api/relay/status` POST, `relay-status`, `expirationTtl` | ✓ |
| 06-03 | `+page.svelte`: `demandRegistered`, fetch demand POST, boundary gated | ✓ |
| 06-03 | No `RIVER_KV` / `stream-demand` in `+page.server.ts` | ✓ |
| Tooling | `bun check`, `bun lint` | ✓ |

## Recommended manual smoke

1. `packages/web/.dev.vars` from `.dev.vars.example` with `RELAY_API_TOKEN`.
2. `bun dev` — Start stream → player; refresh → poster again.
3. With Workers + KV: curl POST/GET demand and authorized GET as in plan 03.

## Gaps

_None._
