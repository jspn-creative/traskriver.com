# Phase 7: `/health` Endpoint + Shared-Types Purge - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a complete ops-only `/health` payload from `packages/stream` using live supervisor state, and purge relay/demand/JWT/status exports from `packages/shared` so Phase 9 cleanup does not retain dead type surfaces.

In scope: `STRM-08` + `CLEAN-04`.
Out of scope: infra host/network enforcement implementation details from Phase 8 and web cleanup from Phase 9.

</domain>

<decisions>
## Implementation Decisions

### `/health` payload contract and semantics

- [auto] Selected all gray areas: `/health` payload contract and semantics; ops-only exposure boundary; shared-types purge boundary; migration strategy for imports.
- [auto] Q: "How should `/health` fields map to supervisor state?" -> Selected: "Direct passthrough from a typed status snapshot accessor on Supervisor" (recommended default).
- [auto] Q: "What should `status` emit for codec mismatch?" -> Selected: "Expose `codec_mismatch` when guard fails instead of collapsing to generic degraded" (recommended default).
- [auto] Q: "How should `lastSegmentWrittenAgoMs` behave before first segment?" -> Selected: "Return `null` until first segment write is observed" (recommended default).
- [auto] Q: "How should `restartsLast1h` be computed?" -> Selected: "In-memory rolling window counter on supervisor restart events" (recommended default).

### Ops-only exposure boundary for `/health`

- [auto] Q: "Where is ops-only enforcement anchored?" -> Selected: "App-level host/interface gate in `packages/stream` now, with reverse-proxy/network hardening in Phase 8" (recommended default).
- [auto] Q: "What should non-ops callers receive?" -> Selected: "Return 404 to avoid advertising health surface" (recommended default).
- [auto] Q: "How should ops host allowlist be configured?" -> Selected: "Env-configurable allowlist with safe local defaults" (recommended default).
- [auto] Q: "Should public HLS hostname ever expose `/health`?" -> Selected: "No; explicitly blocked by hostname checks and documented as invariant" (recommended default).

### Shared-types purge boundary (`packages/shared`)

- [auto] Q: "What gets removed from shared root exports?" -> Selected: "Remove all relay/demand/status/JWT-related interfaces, types, and constants" (recommended default).
- [auto] Q: "How should purge be enforced?" -> Selected: "Treat `packages/shared/index.ts` as the single allowed public surface and delete dead exports there first" (recommended default).
- [auto] Q: "What to do with still-needed local shapes?" -> Selected: "Re-home per-package types inside owning package (`web` or `relay`) instead of re-adding to shared" (recommended default).
- [auto] Q: "How is completion validated?" -> Selected: "Repo-wide `bun check` must pass with zero orphaned imports" (recommended default).

### Migration strategy for existing imports

- [auto] Q: "How should import breakages be handled?" -> Selected: "Mechanical update of import sites in same phase; no temporary compatibility barrel" (recommended default).
- [auto] Q: "Should soft-deprecated aliases remain?" -> Selected: "No compatibility aliases; hard removal aligns with milestone cleanup intent" (recommended default).
- [auto] Q: "Should relay package be touched heavily in this phase?" -> Selected: "Minimal edits only as needed for type integrity; package deletion remains Phase 9" (recommended default).
- [auto] Q: "What if an item appears scope-adjacent but new?" -> Selected: "Defer as future phase/backlog item; do not expand Phase 7 boundary" (recommended default).

### Claude's Discretion

- Exact naming of the new supervisor health snapshot type and helper methods.
- Exact env key names for ops host allowlist and local-default behavior.
- Exact placement of moved types in `packages/web` vs `packages/relay` while keeping imports clear.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase inputs and constraints

- `.planning/ROADMAP.md` — Phase 7 goal, dependencies, and success criteria (`STRM-08`, `CLEAN-04`).
- `.planning/REQUIREMENTS.md` — authoritative requirement definitions for `STRM-08` and `CLEAN-04`.
- `.planning/PROJECT.md` — milestone intent and constraints around ops surface and cleanup direction.
- `.planning/STATE.md` — current phase position and carry-forward context.

### Prior phase decisions that constrain Phase 7

- `.planning/phases/05-packages-stream-skeleton/05-CONTEXT.md` — health status enum baseline and Node/Hono architecture constraints.
- `.planning/phases/06-mediamtx-supervisor-rtsp-ingest/06-CONTEXT.md` — supervisor lifecycle, codec guard behavior, and status mapping assumptions.

### Code surfaces to modify

- `packages/stream/src/server.ts` — `/health` route and response payload expansion point.
- `packages/stream/src/supervisor.ts` — live runtime source for status/codec/restarts/uptime/segment freshness signals.
- `packages/stream/src/index.ts` — integration seam for ops-only gating config wiring.
- `packages/shared/index.ts` — shared public export surface to purge relay/demand/JWT/status types.

### Workspace conventions

- `.planning/codebase/CONVENTIONS.md` — formatting/type-check guardrails used for verification.
- `AGENTS.md` — project-level working preferences and milestone constraints.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `Supervisor` in `packages/stream/src/supervisor.ts` already tracks readiness, codec checks, and restart paths; extend with structured health snapshot data.
- `createApp` in `packages/stream/src/server.ts` already injects a status accessor; extend this DI pattern for full payload and ops gate.
- `packages/stream/src/index.ts` already wires config, app, and supervisor lifecycle in one place.

### Established Patterns

- Node 22 + Hono + typed config/logging architecture is already locked from Phases 5-6.
- In-process supervisor state machine drives health semantics; no external datastore expected.
- Single-file shared export surface (`packages/shared/index.ts`) is treated as canonical public API.

### Integration Points

- `/health` payload expansion sits at `createApp` boundary and should read a single supervisor snapshot function.
- Ops-only restriction belongs at request handling boundary in stream service, reinforced by infra in Phase 8.
- Shared-type purge must be synchronized with all import sites in `packages/web` and `packages/relay` to keep `bun check` green.

</code_context>

<specifics>
## Specific Ideas

- Keep `/health` intentionally ops-focused: detailed diagnostics for operators, no public exposure on HLS hostname.
- Prefer hard deletion over deprecation shims for shared relay-era types to avoid dragging dead surfaces into Phase 9.

</specifics>

<deferred>
## Deferred Ideas

- Infra-level enforcement hardening (systemd/network/proxy/TLS specifics) remains in Phase 8.
- Full relay package deletion and broader workspace cleanup remain in Phase 9.

</deferred>

---

_Phase: 07-health-endpoint-shared-types-purge_
_Context gathered: 2026-04-22_
