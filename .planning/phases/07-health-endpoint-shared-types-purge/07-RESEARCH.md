# Phase 7: `/health` Endpoint + Shared-Types Purge - Research

**Researched:** 2026-04-22
**Domain:** Node/Hono ops endpoint design + monorepo type purge
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- `/health` payload is a **direct passthrough from a typed status snapshot accessor on Supervisor** (no separate collector).
- `status` emits **`codec_mismatch`** when codec guard fails (do not collapse to generic `degraded`).
- `lastSegmentWrittenAgoMs` returns **`null`** until first segment write observed.
- `restartsLast1h` is an **in-memory rolling-window counter** on supervisor restart events (no datastore).
- Ops-only enforcement lives at **app-level (Hono) host/interface gate in `packages/stream`** now; reverse-proxy/network hardening deferred to Phase 8.
- Non-ops callers receive **404** (don't advertise the surface).
- Ops host allowlist is **env-configurable with safe local defaults**.
- Public HLS hostname **must never** serve `/health`; blocked explicitly by hostname checks and documented as invariant.
- Shared-types purge: **remove ALL relay/demand/status/JWT interfaces, types, constants** from `packages/shared/index.ts`.
- Enforcement: treat `packages/shared/index.ts` as the single allowed public surface; delete dead exports there first.
- Still-needed shapes are **re-homed into their owning package** (`packages/web` or `packages/relay`) — no re-add to shared, no compatibility barrel, no soft-deprecated aliases.
- Import breakages fixed **mechanically in-phase**; no temporary barrel.
- `packages/relay` gets **minimal edits only** (type integrity); full deletion stays in Phase 9.
- Completion validated by **repo-wide `bun check` = green**.
- Anything scope-adjacent but new → defer to backlog; do not grow Phase 7.

### Claude's Discretion

- Exact naming of new supervisor health-snapshot type and helper methods.
- Exact env key names for ops host allowlist and local-default behavior.
- Exact placement of moved types in `packages/web` vs `packages/relay`.

### Deferred Ideas (OUT OF SCOPE)

- Infra-level enforcement (systemd/network/proxy/TLS specifics) — **Phase 8**.
- Full `packages/relay` deletion and broader workspace cleanup — **Phase 9**.
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID       | Description                                                                                                                         | Research Support                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| STRM-08  | `/health` returns `{ status, rtspConnected, codec, lastSegmentWrittenAgoMs, restartsLast1h, uptimeMs }` bound to ops-only interface | Supervisor snapshot design, Hono host-gate middleware, fs.watch for segment freshness |
| CLEAN-04 | Delete relay/demand/JWT/status types from `packages/shared`; root `index.ts` left clean                                             | Full import-site map; re-home plan into owning packages                               |

</phase_requirements>

## Summary

Phase 7 has two independent, small deliverables that ride in one phase:

1. **`/health` expansion** — grow the existing `createApp({ getStatus })` wiring into `createApp({ getHealth })` where `getHealth()` returns a full `HealthSnapshot` produced by `Supervisor`. The supervisor already tracks everything needed except: a rolling 1h restart counter, a boot timestamp for uptime, a last-segment-write timestamp, and a non-exiting `codec_mismatch` state. Bind `/health` behind a Hono middleware that checks `Host` header against an env allowlist and returns `404` otherwise.
2. **Shared-types purge** — `packages/shared/index.ts` is the entire public surface of `@traskriver/shared` (single-file export; `main` and `exports["."]` both point at it per `packages/shared/package.json`). Delete every export from it, move the types that still have live consumers (relay poller/status-reporter/state-machine/index + web `+server.ts` routes + `+page.svelte` + `web/src/lib/index.ts`) into the owning package, then run `bun check`.

**Primary recommendation:** Extend `Supervisor` with a `getHealthSnapshot()` accessor, swap `createApp` from `getStatus` → `getHealth`, add a `hostAllowlist` Hono middleware, and move the eight relay/demand types from `packages/shared/index.ts` into `packages/relay/src/types.ts` and `packages/web/src/lib/types.ts` in the same commit that empties `packages/shared/index.ts`.

## Standard Stack

### Core

| Library             | Version                                       | Purpose                                   | Why Standard                                                |
| ------------------- | --------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| `hono`              | ^4.12.14 (verified 2026-04-22 via `npm view`) | HTTP routing + middleware for `/health`   | Already locked Phase 5; typed `c.req.header('host')` access |
| `@hono/node-server` | ^2.0.0 (verified 2026-04-22)                  | Node serve adapter                        | Already in use; unchanged                                   |
| `pino`              | ^9.x (already installed)                      | Structured log for denials/restart events | Already the project logger                                  |

No new runtime deps. `/health` body is hand-rolled JSON; middleware is inline. No validation lib needed (Supervisor produces typed output).

### Supporting

| Library              | Version | Purpose                                                                        | When to Use                                   |
| -------------------- | ------- | ------------------------------------------------------------------------------ | --------------------------------------------- |
| `node:fs` (built-in) | Node 22 | `fs.watch` on `HLS_DIR` for `.ts` segment creation → `lastSegmentWrittenAgoMs` | Preferred over polling `fs.stat` each request |

### Alternatives Considered

| Instead of                                 | Could Use                                      | Tradeoff                                                                                                                                                            |
| ------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fs.watch(HLS_DIR)` for segment timestamps | Derive from MediaMTX API `bytesReceived` delta | `bytesReceived` tracks RTSP **ingest** bytes, not segment **write**; they diverge during codec guard failure or disk issues. Use fs.watch for true write freshness. |
| Host header middleware                     | IP allowlist by `req.socket.remoteAddress`     | Tailscale + `ops.*` hostname is the architecturally-named surface (CONTEXT); IP checks belong in Phase 8 infra.                                                     |
| Env allowlist                              | Hardcoded `ops.`-prefix regex                  | Env allowlist is explicit and testable; prefix regex hides intent. CONTEXT locks env-configurable.                                                                  |

**Installation:**

```bash
# No new installs. All dependencies already in packages/stream.
```

**Version verification (2026-04-22):**

```bash
npm view hono version            # 4.12.14
npm view @hono/node-server version  # 2.0.0
```

Training-data versions matched registry; no drift.

## Architecture Patterns

### Recommended Module Layout (additions only)

```
packages/stream/src/
├── server.ts           # EXTEND: createApp({ getHealth }), add host-gate middleware
├── supervisor.ts       # EXTEND: restart window, boot time, segment watcher, codec-mismatch state, getHealthSnapshot()
├── health.ts           # NEW (optional): HealthSnapshot type + HealthStatus enum re-home if server.ts grows
├── segment-watcher.ts  # NEW (optional): fs.watch wrapper → {lastWriteAt: number | null}
└── ...

packages/relay/src/
└── types.ts            # NEW: re-homed DemandResponse, RelayState, RelayInternalState, RelayStatusPayload, RelayConfig

packages/web/src/lib/
└── types.ts            # NEW: re-homed RelayStatusResponse (or whatever the route/page still consumes)

packages/shared/
└── index.ts            # EMPTY (or single `export {}` to keep it a valid ESM module)
```

### Pattern 1: Supervisor HealthSnapshot Accessor

**What:** A single typed method on `Supervisor` that returns the complete `/health` payload shape. Server reads it on every request; no caching, no globals.

**When to use:** Always — matches the locked "direct passthrough" decision and the existing `getStatus()` DI pattern.

**Example:**

```typescript
// packages/stream/src/supervisor.ts (additions)

export type HealthStatus = 'starting' | 'ready' | 'degraded' | 'codec_mismatch' | 'fatal';

export interface HealthSnapshot {
	status: HealthStatus;
	rtspConnected: boolean;
	codec: string | null;
	lastSegmentWrittenAgoMs: number | null;
	restartsLast1h: number;
	uptimeMs: number;
}

export class Supervisor {
	private readonly bootAt = Date.now();
	private readonly restartTimestamps: number[] = [];
	private lastCodec: string | null = null;
	private lastSegmentWriteAt: number | null = null;

	getHealthSnapshot(): HealthSnapshot {
		const now = Date.now();
		this.pruneRestartWindow(now);
		return {
			status: this.computeStatus(),
			rtspConnected: this.state.kind === 'ready',
			codec: this.lastCodec,
			lastSegmentWrittenAgoMs:
				this.lastSegmentWriteAt === null ? null : now - this.lastSegmentWriteAt,
			restartsLast1h: this.restartTimestamps.length,
			uptimeMs: now - this.bootAt
		};
	}

	private pruneRestartWindow(now: number) {
		const cutoff = now - 3_600_000;
		while (this.restartTimestamps.length && this.restartTimestamps[0]! < cutoff) {
			this.restartTimestamps.shift();
		}
	}
}
```

### Pattern 2: Codec Mismatch Without Immediate Exit

**What:** When codec guard fires, set `state = { kind: 'codecMismatch' }` and DO NOT call `process.exit(1)` inside the poll handler. Let the next `/health` request observe `status: "codec_mismatch"`, then exit (e.g., via `setImmediate(() => process.exit(1))` after a short grace, OR keep the process alive so ops can observe and restart manually — CONTEXT doesn't explicitly require exit; success criterion #3 requires that the state **surface in `/health`**).

**Current code:** `supervisor.ts:150-157` sets `state = { kind: 'fatal' }` and calls `process.exit(1)` synchronously — `/health` cannot observe it.

**Recommendation:** Add a new `State` variant `{ kind: 'codecMismatch', codec: string }`, map it to `HealthStatus = 'codec_mismatch'` in `computeStatus()`, defer the exit. Phase 6 CONTEXT explicitly said "any caller reading `/health` during the brief window just sees `starting`. That's fine" — but Phase 7 success criterion #3 explicitly reverses that. Phase 7 wins.

**Open question:** does the process still exit, or stay alive "broken"? See Open Questions below.

### Pattern 3: Host-Gate Middleware (Hono)

**What:** A single Hono middleware, registered before `/health`, that rejects requests whose `Host` header is not in the ops allowlist with `404`.

**Example:**

```typescript
// packages/stream/src/server.ts

import { Hono } from 'hono';
import type { HealthSnapshot } from './supervisor.ts';

export interface AppOptions {
	getHealth: () => HealthSnapshot;
	opsHosts: ReadonlySet<string>; // lowercase, port-stripped
}

export function createApp(opts: AppOptions) {
	const app = new Hono();

	app.use('/health', async (c, next) => {
		const raw = c.req.header('host') ?? '';
		const hostOnly = raw.split(':')[0]!.toLowerCase();
		if (!opts.opsHosts.has(hostOnly)) {
			return c.notFound();
		}
		await next();
	});

	app.get('/health', (c) => {
		c.header('Cache-Control', 'no-store');
		return c.json(opts.getHealth());
	});

	return app;
}
```

**Wiring (`index.ts`):**

```typescript
const opsHosts = new Set(
	(process.env.OPS_HOSTS ?? 'localhost,127.0.0.1,ops.localhost')
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean)
);

const app = createApp({
	getHealth: () => supervisor.getHealthSnapshot(),
	opsHosts
});
```

Add `OPS_HOSTS` to zod schema in `config.ts` (comma-separated, default `'localhost,127.0.0.1'`; production sets to `ops.traskriver.com` or similar) — local-default-safe per CONTEXT.

### Pattern 4: Segment Freshness via `fs.watch`

**What:** Spawn a single `fs.watch(HLS_DIR, { persistent: false })` listener on boot; on every `rename` event where filename ends `.ts`, update `lastSegmentWriteAt = Date.now()`. No per-request fs work.

**Why not polling:** `/health` is ops-only but callers may hammer it; polling fs.stat per request is wasteful. One watcher + one timestamp is O(1) per request.

**Gotcha:** `fs.watch` on Linux (inotify) can miss events under heavy load. Acceptable here — a missed event means `lastSegmentWrittenAgoMs` is briefly stale, which ops already tolerates (MediaMTX writes every 2s). For robustness, optionally debounce via also listening to `change` events.

### Anti-Patterns to Avoid

- **Reading fs/MediaMTX API inside the `/health` handler** — blocks request, couples endpoint to upstreams, and MediaMTX API already polled by Supervisor every 5s.
- **Storing `restartsLast1h` in a file or Redis** — CONTEXT locks in-memory; acceptable because restart means process restart means counter naturally zeros.
- **Putting ops gate in the `/health` route body** — use middleware so future ops routes inherit it without duplication.
- **Throwing on missing Host header** — some load balancers omit it; treat missing as "not ops" → 404.
- **Re-adding types to `packages/shared/index.ts` "just in case"** — CONTEXT: hard removal, no compat barrel.

## Don't Hand-Roll

| Problem                  | Don't Build                         | Use Instead                    | Why                                                                                             |
| ------------------------ | ----------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| JSON response formatting | Manual `JSON.stringify` + `res.end` | Hono `c.json()` (already used) | Sets `Content-Type`, handles encoding                                                           |
| Host parsing             | Regex on full `Host` header         | `.split(':')[0].toLowerCase()` | Host header syntax is well-defined (`host[:port]`); splitting is sufficient and well-understood |
| File watching            | Polling `readdir` every N seconds   | `fs.watch`                     | Kernel-native event stream; O(1)                                                                |
| Rolling window counter   | Bounded array + eager prune         | Same (but prune lazy, on read) | Eager prune requires timer; lazy is simpler and correct                                         |

**Key insight:** `/health` is infrastructure plumbing — keep it dumb. All logic lives in `Supervisor`; the route is a single `c.json(opts.getHealth())`.

## Common Pitfalls

### Pitfall 1: Host header case sensitivity

**What goes wrong:** Browsers/proxies may send `Host: OPS.TraskRiver.com`; allowlist check fails.

**Why it happens:** Host header is case-insensitive per RFC 7230 §5.4; TypeScript `Set<string>` is not.

**How to avoid:** Lowercase both sides at parse time (`.toLowerCase()`) and on allowlist ingestion.

**Warning signs:** Integration test with mixed-case `Host` returns 404.

### Pitfall 2: `Host` spoofing

**What goes wrong:** Attacker on the public HLS hostname sends `Host: ops.traskriver.com` → gets `/health`.

**Why it happens:** App-level host gate trusts the client-supplied header.

**How to avoid:** CONTEXT acknowledges this — Phase 7 provides the app-level gate; Phase 8 hardens with reverse-proxy + network (systemd `BindToInterface` / firewall / Tailscale). Document as "defense in depth layer 1 of 2". Success criterion #2 says "bound to an ops-only interface (Tailscale or `ops.*` host)" — the Host-header match IS the `ops.*` host branch.

**Warning signs:** N/A at phase level; infra gate in Phase 8.

### Pitfall 3: `fs.watch` handle leaking on shutdown

**What goes wrong:** Process fails to exit cleanly; `fs.watch` holds an FD.

**Why it happens:** Watcher not closed in `Supervisor.shutdown()`.

**How to avoid:** Store the `FSWatcher` instance on `Supervisor`, call `.close()` in `shutdown()` alongside `stopPolling()`.

**Warning signs:** SIGTERM doesn't terminate process; `/proc/<pid>/fd` shows open inotify handle.

### Pitfall 4: Restart-counter double-counting

**What goes wrong:** A single stall triggers `killChild()` + `scheduleRestart()`; if both the `exit` handler AND `scheduleRestart` both increment, count doubles.

**Why it happens:** `scheduleRestart()` called from two paths (`onExit` and stall detection → `killChild().then(() => scheduleRestart())`).

**How to avoid:** Increment `restartTimestamps` at a single canonical point — the start of `scheduleRestart()` — and ensure the `exit` handler's own `scheduleRestart()` call path is the only entry during normal restarts. Stall path already awaits `killChild()` which triggers `child.on('exit')` → which itself calls `scheduleRestart()`. So the **stall code's explicit `.then(() => scheduleRestart())` is redundant** with the exit handler. Either remove the explicit call in stall path, OR gate increment on a single entry point.

**Warning signs:** `restartsLast1h` grows faster than observed MediaMTX restarts.

### Pitfall 5: `lastSegmentWrittenAgoMs === 0` vs `null` confusion

**What goes wrong:** Test harness sees `0` and treats it as "never written" by coincidence.

**Why it happens:** Conflating "just written" with "never written".

**How to avoid:** CONTEXT is explicit: `null` until first write. Union type `number | null`. Do not coerce to `0` or `-1`.

**Warning signs:** Web client (Phase 9) degraded-state logic misfires at boot.

### Pitfall 6: Shared-types purge order

**What goes wrong:** Delete `packages/shared/index.ts` exports first → `bun check` fails repo-wide → cannot verify until all import sites fixed.

**Why it happens:** Natural top-down ordering.

**How to avoid:** Work bottom-up: (1) create `packages/relay/src/types.ts` + `packages/web/src/lib/types.ts` with the moved types, (2) update every import site to point at new local paths, (3) run `bun check` green, (4) THEN empty `packages/shared/index.ts`, (5) run `bun check` again. Each step is a reversible commit.

**Warning signs:** Broken intermediate states committed to phase branch.

## Code Examples

### Full `HealthSnapshot` type (add to `supervisor.ts` or new `health.ts`)

```typescript
export type HealthStatus = 'starting' | 'ready' | 'degraded' | 'codec_mismatch' | 'fatal';

export interface HealthSnapshot {
	status: HealthStatus;
	rtspConnected: boolean;
	codec: string | null;
	lastSegmentWrittenAgoMs: number | null;
	restartsLast1h: number;
	uptimeMs: number;
}
```

### Segment watcher helper

```typescript
// packages/stream/src/segment-watcher.ts
import { watch, type FSWatcher } from 'node:fs';
import type { Logger } from 'pino';

export class SegmentWatcher {
	private watcher: FSWatcher | null = null;
	private lastWriteAt: number | null = null;

	constructor(
		private readonly dir: string,
		private readonly log: Logger
	) {}

	start() {
		this.watcher = watch(this.dir, { persistent: false }, (eventType, filename) => {
			if (!filename || !filename.endsWith('.ts')) return;
			this.lastWriteAt = Date.now();
		});
		this.watcher.on('error', (err) => this.log.warn({ err }, 'segment watcher error'));
	}

	stop() {
		this.watcher?.close();
		this.watcher = null;
	}

	getLastWriteAt() {
		return this.lastWriteAt;
	}
}
```

### Ops-host middleware with logging

```typescript
app.use('/health', async (c, next) => {
	const raw = c.req.header('host') ?? '';
	const hostOnly = raw.split(':')[0]!.toLowerCase();
	if (!opts.opsHosts.has(hostOnly)) {
		opts.log?.debug({ host: hostOnly }, '/health denied: non-ops host');
		return c.notFound();
	}
	await next();
});
```

### Env extension (`config.ts`)

```typescript
OPS_HOSTS: z.string()
	.default('localhost,127.0.0.1')
	.transform((s) =>
		s
			.split(',')
			.map((x) => x.trim().toLowerCase())
			.filter(Boolean)
	);
```

(Or keep as raw string in zod and parse in `index.ts` — discretion.)

## Shared-Types Purge: Site-by-Site Map

**Exports currently in `packages/shared/index.ts` (all will be removed):**

| Symbol                            | Type       | Consumers                                                                                                               |
| --------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| `DemandResponse`                  | interface  | `packages/relay/src/poller.ts`, `packages/web/src/routes/api/stream/demand/+server.ts`, `packages/web/src/lib/index.ts` |
| `RelayState`                      | type alias | `packages/web/src/lib/index.ts`                                                                                         |
| `RelayInternalState`              | type alias | `packages/relay/src/state-machine.ts`                                                                                   |
| `RelayStatusPayload`              | interface  | `packages/relay/src/status-reporter.ts`, `packages/web/src/routes/api/relay/status/+server.ts`                          |
| `RelayStatusResponse`             | interface  | `packages/web/src/routes/api/relay/status/+server.ts`, `packages/web/src/routes/+page.svelte`                           |
| `RELAY_STATUS_TTL_SECONDS`        | const      | `packages/web/src/routes/api/relay/status/+server.ts`                                                                   |
| `RELAY_STATUS_STALE_THRESHOLD_MS` | const      | `packages/web/src/routes/api/relay/status/+server.ts`                                                                   |
| `RelayConfig`                     | interface  | `packages/relay/src/index.ts`                                                                                           |

### Re-home plan (CONTEXT: owning-package)

- **`packages/relay/src/types.ts` (NEW)** — `RelayConfig`, `RelayInternalState`, `DemandResponse`, `RelayStatusPayload`.
  - Consumers updated: `poller.ts`, `status-reporter.ts`, `state-machine.ts`, `index.ts` → `import … from './types.ts'`.
- **`packages/web/src/lib/types.ts` (NEW)** — `RelayState` (if still needed), `RelayStatusResponse`, `RelayStatusPayload` (web route also consumes it; duplicate locally — two separate "wire" definitions is fine, they're small and getting deleted in Phase 9), `RELAY_STATUS_TTL_SECONDS`, `RELAY_STATUS_STALE_THRESHOLD_MS`, `DemandResponse`.
  - Consumers updated: `src/lib/index.ts`, `src/routes/api/relay/status/+server.ts`, `src/routes/api/stream/demand/+server.ts`, `src/routes/+page.svelte`.

**Note on duplication:** Temporarily duplicating `DemandResponse` / `RelayStatusPayload` across relay and web is acceptable — Phase 9 deletes all of this. The "wire contract" is frozen and the duplication dies in 1 phase.

### After purge

`packages/shared/index.ts` becomes empty. Options:

```typescript
// Option A: empty module (safest — still a valid ESM module)
export {};
```

Or delete the file entirely and also remove `main`/`types`/`exports` from `packages/shared/package.json`. **Recommendation: Option A** — keeps the package deletable in Phase 9 as a single operation; avoids mid-milestone churn in workspace config.

`packages/shared/package.json` `main`/`types`/`exports` still point at `index.ts` (now empty) — harmless; Phase 9 deletes the package.

### Verification command

```bash
bun run check    # turbo-fanned tsc --noEmit across all packages
```

Must be **green** repo-wide (not just stream).

## State of the Art

| Old Approach                                     | Current Approach                                                      | When Changed     | Impact                                         |
| ------------------------------------------------ | --------------------------------------------------------------------- | ---------------- | ---------------------------------------------- |
| Node `http` + manual routing                     | Hono + `@hono/node-server`                                            | Phase 5          | Already in place                               |
| Polling FS per health request                    | `fs.watch` + cached timestamp                                         | This phase       | O(1) per request                               |
| Shared barrel re-exports for cross-package types | Per-package local types, shared only for true cross-package contracts | Milestone intent | Smaller deletion surface; fewer coupling edges |

**Deprecated/outdated (in this codebase):**

- `@traskriver/shared`'s relay/demand/JWT surface: deleted in this phase (CLEAN-04).
- Supervisor's `getStatus()` sole-accessor: superseded by `getHealthSnapshot()`.
- `state.kind === 'fatal'` via immediate `process.exit`: gives way to observable `codecMismatch` state.

## Open Questions

1. **Does the process exit on `codec_mismatch`, or stay alive so ops can observe and intervene?**
   - What we know: CONTEXT says `/health` must surface `codec_mismatch` (criterion #3). Phase 6 CONTEXT said fatal-exit is operator-error and relies on Phase 8 systemd `StartLimitBurst` to eventually stop restart loops.
   - What's unclear: If we exit, `/health` window is milliseconds (criterion #3 effectively unobservable). If we stay alive, systemd won't restart and the service runs "broken" indefinitely.
   - Recommendation: **Stay alive but "broken"** — set `state = codecMismatch`, stop polling, do NOT call `process.exit`. MediaMTX child already killed by the codec guard. `/health` reports `status: 'codec_mismatch'`. Operator sees it, fixes camera, restarts service. This matches "ops-only `/health`" intent. Planner should confirm with user if ambiguous.

2. **Does `OPS_HOSTS` env var live in `config.ts` (zod) or `index.ts` (ad-hoc)?**
   - Recommendation: zod (`config.ts`) — consistent with every other env in the package. Default to `'localhost,127.0.0.1'` (CONTEXT: safe local defaults).

3. **`fs.watch` event `rename` vs `change` semantics across OSes?**
   - On Linux/macOS, MediaMTX writes `.ts` files via create-then-rename OR direct write; both emit events. Listen to both; treat any event on a `.ts` filename as a segment-write signal. Low risk.

4. **Should `packages/shared/index.ts` become empty (`export {}`) or be deleted outright?**
   - Recommendation: empty module this phase; package deletion in Phase 9.

## Sources

### Primary (HIGH confidence)

- **`packages/stream/src/supervisor.ts`** (read in full) — current state machine, backoff, polling, codec guard all present; only need to add fields + accessor + not-exit-on-codec.
- **`packages/stream/src/server.ts`** (read in full) — `createApp({ getStatus })` is the exact DI seam to extend.
- **`packages/stream/src/index.ts`** (read in full) — boot wiring, where `opsHosts` is assembled.
- **`packages/shared/index.ts`** (read in full) — confirmed 8 exports; no other symbols.
- **`packages/shared/package.json`** — confirmed single-file export surface (`main`: `./index.ts`, `exports["."]`: `./index.ts`).
- **Phase 5 + Phase 6 CONTEXT.md** — confirm Hono lock, `HealthStatus` enum definition, forward-compat choices.
- **`.planning/REQUIREMENTS.md`** — authoritative STRM-08 + CLEAN-04 definitions.
- **Phase 7 CONTEXT.md** — user decisions (all [auto] selections documented).
- **`npm view hono version`** → `4.12.14` (2026-04-22); `@hono/node-server` → `2.0.0`.

### Secondary (MEDIUM confidence)

- Hono routing/middleware API: stable for years; `app.use(path, mw)` and `c.req.header()` well-documented.
- Node `fs.watch` inotify semantics: known to occasionally miss events under load; acceptable tradeoff here.

### Tertiary (LOW confidence)

- None — all claims verified against current code or package registry.

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — no new deps; all libraries already in use.
- Architecture: **HIGH** — reuses existing DI seam; supervisor already tracks most needed state.
- Pitfalls: **HIGH** — drawn directly from current `supervisor.ts` and cross-package grep of import sites.
- Open questions: 4 items (1 behavioral, 3 minor/discretionary).

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (stable dependencies; only drift risk is Hono minor bumps).
