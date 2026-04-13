# Project Retrospective

_Living document — updated after each shipped milestone._

## Milestone: v1.2 — Stream Reliability & Error Handling

**Shipped:** 2026-04-13
**Phases:** 2 | **Plans:** 3

### What was built

- HLS playback hardened: HLS.js-native recovery instead of remount loops; consolidated error paths; quieter startup behavior
- Stream signing: 3600s JWT TTL; state machine only treats confirmed playback loss from `viewing` as stream-end
- Counterscale CORS: new `packages/counterscale-proxy` Worker + layout `reporterUrl`; routes GET to `/collect`, `/cache` to `/cache`; `global_fetch_strictly_public` compatibility flag

### What worked

- Phase plans with explicit must-haves and debug write-ups accelerated execution
- Shipping the CORS fix in-repo (proxy) avoided waiting on upstream Counterscale Worker changes

### What was inefficient

- Initial proxy assumed POST + `/tracker` only; tracker v3 uses GET + `/collect` — required a correction pass
- Worker→`*.workers.dev` subrequest behavior (404 without `global_fetch_strictly_public`, broken with copied `Host` headers) was non-obvious until isolated with `wrangler dev` vs production

### Patterns established

- Thin edge proxies for third-party Workers that cannot emit CORS — same account, explicit compat flags, minimal forwarded headers
- Trust HLS.js recovery first; reserve destructive remount and page-level `ended_confirming` for confirmed user-visible failures

### Key lessons

1. Read the shipped client library (e.g. `@counterscale/tracker` dist) before fixing “the tracker URL” — the real path was `/collect`, not `/tracker`.
2. When a Worker `fetch`es another `workers.dev` host on the same account, verify with production `curl` and add `global_fetch_strictly_public` early.

### Cost observations

- Not tracked at milestone level for this repo.

---

## Cross-Milestone Trends

### Process evolution

| Milestone | Phases | Key change                             |
| --------- | ------ | -------------------------------------- |
| v1.1      | 3      | GSD phases for polish + analytics      |
| v1.2      | 2      | Debug-driven reliability + infra proxy |

### Top lessons (cross-milestone)

1. Production console logs + HAR/debug notes beat guessing player state.
2. Cloudflare Worker edge cases (CORS, subrequests, headers) deserve a short “spike” checklist before locking a plan.
