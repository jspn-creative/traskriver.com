# Phase 6: MediaMTX Supervisor + RTSP Ingest — Research

**Researched:** 2026-04-20
**Domain:** Go-binary child-process supervision (Node 22) + MediaMTX v1.17.x HLS/RTSP config + API polling
**Confidence:** HIGH for MediaMTX config/API (verified against upstream source + current docs); HIGH for Node `child_process.spawn`; MEDIUM for the "correct" interpretation of two success criteria that conflict with MediaMTX's observable behavior (flagged as open questions).

## Summary

Phase 6 wires a Node 22 supervisor around a MediaMTX v1.17.1 child process on the Phase 5 skeleton. The supervisor owns a tiny in-process state machine (`spawning → waitingReady → ready ⇌ stalled → shuttingDown/fatal`), generates a literal-template `mediamtx.yml` at boot from zod env, `spawn`s the binary, line-buffers stdout/stderr into a Pino child logger, polls MediaMTX's REST API every 5s for `(ready, bytesReceived, tracks)`, restarts on stall (≥75s Δbytes=0 while ready), exits non-zero on codec ≠ `H264`, and tears MediaMTX down before the Hono `/health` server on SIGTERM.

Two success criteria conflict with MediaMTX's native behavior and need user sign-off before planning (see `## Open Questions`):

- **Cache-Control headers** on `.m3u8` / `.ts` at `localhost:8888` are NOT `public, max-age=1` / `public, max-age=86400, immutable` — MediaMTX emits `no-cache` / `max-age=30` / `max-age=3600`. Not configurable. (Phase 8 reverse proxy is the correct place.)
- **`EXT-X-DISCONTINUITY`** is NOT emitted by MediaMTX on muxer restart; instead the muxer is destroyed and recreated with a new random segment prefix + `MEDIA-SEQUENCE: 0`. Functionally equivalent to discontinuity for hls.js, but not the literal tag.

**Primary recommendation:** Pin `mediamtx v1.17.1`; use the MPEG-TS HLS variant (passthrough H.264); poll `GET /v3/paths/get/trask` every 5s; check `path.tracks[0] === 'H264'` (simpler than `tracks2`); line-buffer stdout with `readline.createInterface`; implement the supervisor as a class (mutable state + timers map cleanly); generate yaml as a literal template string (20 lines, stable, zero deps).

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**MediaMTX Lifecycle (spawn, config, I/O)**

- Binary resolution: `MEDIAMTX_BIN` env (default `mediamtx`) → assume on PATH. Phase 6 is code-only; binary placement, pinning, and checksum are Phase 8 infra concerns. No vendored binary in repo, no tarball download at boot.
- Config file generated dynamically at boot. Zod env is the single source of truth; supervisor writes `${HLS_DIR}/../mediamtx.yml` (or a supervisor-owned temp path) on spawn, passes it as `mediamtx <path>`. Segment duration, GOP, playlist window, cache headers are literals in the generator.
- Config shape (passthrough HLS): single path `trask` with `source: ${RTSP_URL}`, `sourceOnDemand: no` (always pulling), `sourceProtocol: tcp`, HLS enabled globally with `hlsSegmentDuration: 2s`, `hlsSegmentCount: 6`, `hlsVariant: mpegts`, `hlsDirectory: ${HLS_DIR}`, API enabled on `${MEDIAMTX_API_PORT}`, HLS HTTP origin on `${MEDIAMTX_HLS_PORT}`. No RTMP, no SRT, no WebRTC, no recordings.
- Child I/O: MediaMTX stdout+stderr captured by `child_process.spawn` with `stdio: ['ignore', 'pipe', 'pipe']`. Each stream line-buffered and forwarded to `log.child({ component: 'mediamtx' })` at `info` (stdout) / `warn` (stderr). No file logging; journald picks it up from the Node process's stdout in Phase 8.
- Spawn API: Node `child_process.spawn` (not `exec`, not `execa`). Zero extra deps. Detached: no — child dies with parent.
- Cache headers are MediaMTX's job, not Hono's. Success criterion #4 verified against the MediaMTX HLS origin port directly.

**Backoff + Lifecycle**

- Supervisor owns restart state in-process. Simple class with `currentBackoffMs`, `firstReadyAt`, `restartTimer`, `child`. No external state store in Phase 6.
- Backoff: 1s → 2s → 4s → 8s → 16s → 30s (cap), reset to 1s after 60s clean uptime (clean = child continuously running AND MediaMTX API `ready:true`).
- Graceful shutdown: on SIGTERM/SIGINT, supervisor tears down MediaMTX first: send SIGTERM to child, 10s grace timer, then SIGKILL if still alive. Only after child is gone does the Hono server close and process exit.
- Abnormal child exit: logged at `warn` with exit code + signal; triggers backoff restart (not fatal). Fatal is only: codec mismatch or config/env validation failure at boot.

**Stall Watchdog**

- Poll interval: 5s. Threshold: 75s. Signal: `(bytesReceived, ready)`. Stall = 15 consecutive polls (75s) with `Δbytes == 0` while `ready: true`.
- `ready: false` gates out stall detection.
- On stall: log `warn`, trigger supervised restart (SIGTERM→10s→SIGKILL, then backoff-spawn). Restart counter increments (Phase 7 surfaces this in `/health`).

**Codec Guard**

- Check once: at first transition to `ready`. If codec is not `H264`, log `FATAL: camera codec is {actual}, expected H264` and exit process non-zero.
- No periodic re-check. No retry, no loop, no persistent `codec_mismatch` state machine entry. `codec_mismatch` HealthStatus enum value stays for Phase 7 but Phase 6 exits before `/health` observes it.

**Supervisor State Machine (internal)**

- States: `spawning → waitingReady → ready ⇌ stalled → spawning (restart)` · `→ shuttingDown (SIGTERM received)` · `→ fatal (codec mismatch; process exits)`.
- Maps to `HealthStatus`: `spawning | waitingReady → starting`, `ready → ready`, `stalled | restart-pending → degraded`, codec mismatch → process exits.
- Phase 6 wires the state and updates the `status` field on `/health`; no new keys.

**Phase 6 Config Surface (new env vars)**

Additions to zod schema in `packages/stream/src/config.ts`:

- `RTSP_URL` — `z.string().url()`, required, no default. Full URL including credentials.
- `MEDIAMTX_API_PORT` — `z.coerce.number().int().positive().default(9997)`.
- `MEDIAMTX_HLS_PORT` — `z.coerce.number().int().positive().default(8888)`.
- `HLS_DIR` — `z.string().default('/run/stream/hls')`.
- `MEDIAMTX_BIN` — `z.string().default('mediamtx')`.
- Pino redact: `RTSP_URL` contains a password; Pino must redact. Never log raw `RTSP_URL`.

**Directory Layout (additions to `packages/stream/src/`)**

```
index.ts             (existing — extend boot to also start supervisor)
config.ts            (existing — extend zod schema with new vars)
logger.ts            (existing — add redaction)
server.ts            (existing — /health returns live supervisor status)
supervisor.ts        (new — MediaMTX process supervisor, state machine, backoff)
mediamtx-config.ts   (new — generate MediaMTX yaml from env)
mediamtx-api.ts      (new — poll MediaMTX API for ready/bytes/codec)
watchdog.ts          (new — stall watchdog tied to supervisor)
```

Planner has discretion to split further or merge `watchdog.ts` into `supervisor.ts`.

### Claude's Discretion

- Exact poll-interval / backoff constants (top-of-file consts in `supervisor.ts`).
- `mediamtx-api.ts` uses `fetch` (Node 22 native) or minimal wrapper.
- Line-buffering strategy for child stdout (readline vs manual `\n` split).
- Mapping MediaMTX stderr lines to Pino levels (heuristic parse or all `warn`).
- `supervisor.ts` as class vs closure-based factory.
- MediaMTX yaml generator: literal template string vs object-serialized-to-yaml (prefer template).

### Deferred Ideas (OUT OF SCOPE)

- Full `/health` payload (`rtspConnected`, `codec`, `lastSegmentWrittenAgoMs`, `restartsLast1h`, `uptimeMs`) — **Phase 7**.
- systemd unit, `RuntimeDirectory=stream` tmpfs mount, TLS, journald retention tuning — **Phase 8**.
- MediaMTX binary provisioning (tarball download, sha256 verify, `/usr/local/bin` install) — **Phase 8**.
- DNS (`stream.traskriver.com`, Cloudflare proxy), Let's Encrypt cert + renew — **Phase 8**.
- Camera DDNS, RTSP-user account, port-forward, CVE pre-flight, `FIRMWARE.md` — **Phase 8**.
- Web client swap to new HLS URL, state-machine collapse, `degraded` overlay UX — **Phase 9**.
- Relay/demand/JWT deletion, shared-types purge — **Phases 7 & 9**.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                                            | Research Support                                                                                                                                                                                                                           |
| ------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| STRM-02 | Supervises MediaMTX child with exp-backoff (1→30s, reset on 60s clean uptime), graceful SIGTERM→10s→SIGKILL            | `§ Child-Process Supervision`, `§ Backoff + Graceful Shutdown`                                                                                                                                                                             |
| STRM-03 | Pulls RTSP from Reolink RLC-510WA 24/7 with auto-reconnect                                                             | `§ MediaMTX Config — RTSP Source (current syntax)` — `source: rtsp://...`, `sourceOnDemand: false`, `rtspTransport: tcp`. Reconnection is MediaMTX-internal (muxer recreate loop, `recreatePause = 10s`).                                  |
| STRM-04 | Stall watchdog (60–90s threshold) via MediaMTX API `bytesReceived` + `ready` → supervised restart                      | `§ MediaMTX Control API — endpoints + response shape`. Poll `GET /v3/paths/get/trask`; track Δ`bytesReceived` while `ready: true`.                                                                                                         |
| STRM-05 | Codec guard refuses `ready` unless ingest track codec is `H264`; H.265 fails fast                                      | `§ Codec Guard — exact API strings`. Codec value is literal `"H264"` (PascalCase) per `internal/formatlabel/label.go`.                                                                                                                     |
| STRM-06 | MediaMTX: H.264 passthrough, 2s segments, 2s closed GOP, 6-segment window, `EXT-X-DISCONTINUITY` on muxer restart      | `§ MediaMTX Config — HLS server`. `hlsVariant: mpegts` gives passthrough; GOP is camera-side (INFRA-05). **FLAGGED:** `EXT-X-DISCONTINUITY` not emitted — see `§ Open Questions #2`.                                                       |
| STRM-07 | HLS files to tmpfs, served by MediaMTX on HTTP origin port with correct cache headers (`.m3u8` 1s, `.ts` 1 day immut.) | `§ MediaMTX Config — hlsDirectory`. **FLAGGED:** native MediaMTX cache headers are `no-cache` / `max-age=3600`, not the criterion values — see `§ Open Questions #1`. Phase 8 reverse proxy is the correct fix; move criterion to Phase 8. |

</phase_requirements>

---

## Standard Stack

### Core

| Library / Binary             | Version                                  | Purpose                                 | Why Standard                                                                                        |
| ---------------------------- | ---------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **MediaMTX**                 | **v1.17.1**                              | RTSP→HLS mux, HLS HTTP server, REST API | Current stable release (2026-03-31); no apt package — ship as `tar.gz` binary from GitHub Releases. |
| `node:child_process`         | Node 22 built-in                         | Spawn / supervise MediaMTX              | Zero-dep; `spawn` is the correct API for long-lived children (streams, signals).                    |
| `node:readline`              | Node 22 built-in                         | Line-buffer stdout/stderr               | Handles partial chunks and LF/CRLF correctly with zero deps.                                        |
| `fetch`                      | Node 22 built-in                         | Poll MediaMTX REST API                  | Native, supports `AbortSignal` for poll timeouts.                                                   |
| `pino`                       | `^10.3.1` (already in `packages/stream`) | Logging + redaction                     | Already in scope from Phase 5; `redact` option handles RTSP_URL.                                    |
| `zod`                        | `^4.3.6` (already)                       | Env validation                          | Already in scope from Phase 5; schema extended.                                                     |
| `hono` + `@hono/node-server` | already in                               | Hono `/health`                          | Already in scope; Phase 6 only wires `getStatus` into `createApp`.                                  |

**No new npm dependencies required.** Every Node-side piece is either built-in or already installed by Phase 5.

### Alternatives Considered

| Instead of                 | Could Use                   | Tradeoff                                                                                                   |
| -------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `child_process.spawn`      | `execa`                     | `execa` adds deps; Node 22 `spawn` already has typed stdio + AbortSignal. **Don't use `execa`.** (Locked.) |
| Native `fetch`             | `undici.request` / `got`    | Deps + verbosity; native `fetch` has AbortSignal timeout. **Don't add an HTTP lib.**                       |
| Literal template for yaml  | `yaml` npm package          | yaml lib = ~30KB + parse overhead for 20 lines of stable output. **Don't add `yaml`.** (Locked.)           |
| Class supervisor           | Closure factory             | Either works; class is friendlier to the multi-timer / mutable-state shape. **Class recommended.**         |
| `readline.createInterface` | Manual `\n` split on Buffer | `readline` handles partial chunks + CRLF correctly. **Use `readline`.**                                    |

### MediaMTX Binary Provisioning (Phase 8 concern — noted here for Phase 6 smoke)

- Download: `https://github.com/bluenviron/mediamtx/releases/download/v1.17.1/mediamtx_v1.17.1_linux_amd64.tar.gz`
- SHA256 published in blockchain via GitHub Attestations; verify with `cat checksums.sha256 | grep ... | sha256sum --check`.
- Install path: `/usr/local/bin/mediamtx` (Phase 8 systemd unit).
- For local dev (macOS): `mediamtx_v1.17.1_darwin_arm64.tar.gz`. Place binary on `$PATH` or set `MEDIAMTX_BIN=/abs/path/to/mediamtx`.

**Version verification (2026-04-20):** latest release on GitHub is `v1.17.1` (published 2026-03-31). `tracks2` API field landed in `v1.17.x` via PR #5585 (merged 2026-03-17). Pinning v1.17.1 gives both.

---

## Architecture Patterns

### Recommended File Structure (inside `packages/stream/src/`)

```
index.ts              # boot: config → logger → supervisor (build) → app (inject getStatus) → server → supervisor.start() → signals
config.ts             # zod schema (+ 5 new keys)
logger.ts             # pino factory (+ redact option)
server.ts             # createApp({ getStatus }) — /health reads live status
supervisor.ts         # class Supervisor: state, spawn, backoff, SIGTERM escalation, ready/stalled transitions
mediamtx-config.ts    # buildMediamtxYaml(env) → string
mediamtx-api.ts       # getPathInfo(port, name, signal) → { ready, bytesReceived, codec } via fetch
watchdog.ts           # class Watchdog: start(getSnapshot), onStall(cb), stop()  (or folded into supervisor.ts)
```

### Pattern 1: Supervisor class with pluggable lifecycle

**What:** One class owns the state machine, child handle, backoff timer, and watchdog. The `/health` accessor reads a tiny snapshot.

**When to use:** When you have 3+ interrelated timers + a child process + an exposed status accessor (exactly our case).

**Skeleton (planner can copy verbatim, adjust naming):**

```ts
// supervisor.ts
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from 'pino';
import type { Config } from './config.ts';
import type { HealthStatus } from './server.ts';
import { buildMediamtxYaml } from './mediamtx-config.ts';
import { getPathInfo } from './mediamtx-api.ts';

const POLL_INTERVAL_MS = 5_000;
const STALL_THRESHOLD_POLLS = 15; // 15 * 5s = 75s
const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const CLEAN_UPTIME_MS = 60_000;
const SIGTERM_GRACE_MS = 10_000;
const CODEC_EXPECTED = 'H264' as const;

type State =
	| { kind: 'idle' }
	| { kind: 'spawning' }
	| { kind: 'waitingReady' }
	| {
			kind: 'ready';
			readyAt: number;
			lastBytes: number;
			zeroDeltaPolls: number;
			codecChecked: boolean;
	  }
	| { kind: 'stalled' }
	| { kind: 'shuttingDown' }
	| { kind: 'fatal' };

export class Supervisor {
	private state: State = { kind: 'idle' };
	private child: ChildProcess | null = null;
	private backoffMs = BACKOFF_INITIAL_MS;
	private restartTimer: NodeJS.Timeout | null = null;
	private pollTimer: NodeJS.Timeout | null = null;
	private intentionalStop = false; // distinguishes our SIGTERM from a crash

	constructor(
		private readonly cfg: Config,
		private readonly log: Logger
	) {}

	getStatus(): HealthStatus {
		switch (this.state.kind) {
			case 'ready':
				return 'ready';
			case 'stalled':
				return 'degraded';
			case 'shuttingDown':
			case 'fatal':
				return 'degraded'; // Phase 6 keeps the enum minimal; Phase 7 refines
			default:
				return 'starting';
		}
	}

	async start() {
		await this.spawnChild();
		this.startPolling();
	}

	async shutdown() {
		this.intentionalStop = true;
		this.stopPolling();
		if (this.restartTimer) clearTimeout(this.restartTimer);
		await this.killChild();
	}

	private async spawnChild() {
		this.state = { kind: 'spawning' };

		const yamlText = buildMediamtxYaml(this.cfg);
		const yamlPath = join(this.cfg.HLS_DIR, '..', 'mediamtx.yml');
		await writeFile(yamlPath, yamlText, 'utf8');

		const child = spawn(this.cfg.MEDIAMTX_BIN, [yamlPath], {
			stdio: ['ignore', 'pipe', 'pipe'],
			detached: false,
			env: process.env
		});
		this.child = child;
		const childLog = this.log.child({ component: 'mediamtx', pid: child.pid });

		// line-buffered stdout/stderr
		createInterface({ input: child.stdout! }).on('line', (line) => childLog.info(line));
		createInterface({ input: child.stderr! }).on('line', (line) => childLog.warn(line));

		child.on('exit', (code, signal) => {
			this.log.warn({ code, signal }, 'mediamtx exited');
			this.child = null;
			if (this.intentionalStop || this.state.kind === 'shuttingDown') return;
			this.scheduleRestart();
		});

		child.on('error', (err) => this.log.error({ err }, 'mediamtx spawn error'));

		this.state = { kind: 'waitingReady' };
	}

	private scheduleRestart() {
		this.state = { kind: 'spawning' };
		const delay = this.backoffMs;
		this.log.warn({ backoffMs: delay }, 'scheduling mediamtx restart');
		this.restartTimer = setTimeout(() => {
			this.restartTimer = null;
			void this.spawnChild();
		}, delay);
		this.backoffMs = Math.min(BACKOFF_MAX_MS, this.backoffMs * 2);
	}

	private startPolling() {
		this.pollTimer = setInterval(() => void this.pollOnce(), POLL_INTERVAL_MS);
	}
	private stopPolling() {
		if (this.pollTimer) clearInterval(this.pollTimer);
		this.pollTimer = null;
	}

	private async pollOnce() {
		try {
			const info = await getPathInfo(this.cfg.MEDIAMTX_API_PORT, 'trask', 2_000);
			this.onPoll(info);
		} catch (err) {
			// API unreachable ≠ stall; log at debug, let next poll retry
			this.log.debug({ err }, 'mediamtx api poll failed');
		}
	}

	private onPoll(info: { ready: boolean; bytesReceived: number; codec: string | null }) {
		// Transition to ready on first ready:true + codec check
		if (this.state.kind === 'waitingReady' && info.ready) {
			if (info.codec !== CODEC_EXPECTED) {
				this.log.fatal(
					{ expected: CODEC_EXPECTED, actual: info.codec },
					`FATAL: camera codec is ${info.codec}, expected ${CODEC_EXPECTED}`
				);
				this.state = { kind: 'fatal' };
				process.exit(1);
			}
			this.state = {
				kind: 'ready',
				readyAt: Date.now(),
				lastBytes: info.bytesReceived,
				zeroDeltaPolls: 0,
				codecChecked: true
			};
			this.log.info('mediamtx ready');
			return;
		}

		if (this.state.kind === 'ready') {
			// Reset backoff after 60s clean
			if (
				Date.now() - this.state.readyAt >= CLEAN_UPTIME_MS &&
				this.backoffMs !== BACKOFF_INITIAL_MS
			) {
				this.backoffMs = BACKOFF_INITIAL_MS;
				this.log.info('backoff reset after 60s clean uptime');
			}

			if (!info.ready) {
				this.log.warn('mediamtx source not ready; awaiting reconnect');
				this.state = { kind: 'waitingReady' };
				return;
			}

			const delta = info.bytesReceived - this.state.lastBytes;
			if (delta === 0) {
				this.state.zeroDeltaPolls += 1;
				if (this.state.zeroDeltaPolls >= STALL_THRESHOLD_POLLS) {
					this.log.warn(
						{ thresholdPolls: STALL_THRESHOLD_POLLS, intervalMs: POLL_INTERVAL_MS },
						'stall detected; restarting mediamtx'
					);
					this.state = { kind: 'stalled' };
					void this.killChild().then(() => this.scheduleRestart());
					return;
				}
			} else {
				this.state.zeroDeltaPolls = 0;
				this.state.lastBytes = info.bytesReceived;
			}
		}
	}

	private async killChild() {
		const child = this.child;
		if (!child || child.exitCode !== null) return;
		return new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				this.log.warn('SIGTERM grace expired, SIGKILL');
				try {
					child.kill('SIGKILL');
				} catch {}
			}, SIGTERM_GRACE_MS);
			child.once('exit', () => {
				clearTimeout(timer);
				resolve();
			});
			try {
				child.kill('SIGTERM');
			} catch {
				clearTimeout(timer);
				resolve();
			}
		});
	}
}
```

### Anti-Patterns to Avoid

- **Emitting the yaml via `process.stdin` to MediaMTX.** MediaMTX reads config from a file argument, not stdin. Write to a file, pass path.
- **Treating the `exit` event during our SIGTERM as a crash.** Track `intentionalStop` (or equivalent flag); don't backoff-restart during shutdown.
- **Restarting on `ready: false`.** Not a stall — a disconnected/reconnecting source is MediaMTX's own retry loop. Gate stall detection on `ready: true`.
- **Polling too aggressively.** MediaMTX API is lightweight but 5s is ample for a 75s threshold; don't drop below 2s or you burn CPU for no gain.
- **Writing yaml to the same dir MediaMTX writes HLS segments.** Keep config at `<HLS_DIR>/..` or a separate temp path; don't pollute the HLS directory.
- **Logging the raw config object.** `config.RTSP_URL` contains a password. Redact via Pino `redact: ['RTSP_URL', 'config.RTSP_URL']`.

---

## Don't Hand-Roll

| Problem                                                   | Don't Build                          | Use Instead                                                                                      | Why                                                                                                     |
| --------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Line-buffered stdout from a child                         | Manual Buffer + `\n` scanning        | `readline.createInterface({ input: child.stdout })`                                              | Handles CRLF, partial chunks, UTF-8 boundaries correctly; zero deps; battle-tested.                     |
| HTTP client with timeout                                  | Custom `http.request` wrapper        | Native `fetch(url, { signal: AbortSignal.timeout(2000) })` (Node 22)                             | AbortSignal is built-in; no deps; cleaner.                                                              |
| YAML generation for 20 stable lines                       | `yaml` / `js-yaml` npm               | Literal template string with `${env.RTSP_URL}` etc.                                              | Zero deps; zero escape hazards because the string values are env-validated by zod; 20 lines is trivial. |
| RTSP reconnection / exponential retry at the stream level | Writing your own RTSP client in Node | MediaMTX's `rtspTransport` + its internal reconnection (`recreatePause = 10s` in gohlslib muxer) | MediaMTX handles RTSP frame-level reconnection; Node supervisor only restarts MediaMTX on stall.        |
| Signal handling (SIGTERM escalation)                      | Ad-hoc setTimeout + kill             | Encapsulate in `killChild()` method (see code sample above)                                      | Keeps the pattern reusable; centralizes the "SIGTERM → 10s → SIGKILL" policy.                           |
| Env validation                                            | Manual `process.env` destructuring   | zod (already in use) — extend existing schema                                                    | Fail-fast on boot; pattern already established in Phase 5.                                              |
| HLS mux / cache headers / m3u8 generation                 | N/A — do not attempt                 | MediaMTX itself                                                                                  | This is MediaMTX's entire job. Node serves `/health` only.                                              |

**Key insight:** Phase 6 is intentionally thin Node glue. Everything hard — RTSP parsing, HLS muxing, HTTP serving, connection retry, codec detection — is done by MediaMTX. Don't replicate any of it in Node.

---

## Common Pitfalls

### Pitfall 1: Using the obsolete `sourceProtocol: tcp` key

**What goes wrong:** YAML parses but MediaMTX ignores the field; falls back to `rtspTransports: [udp, multicast, tcp]` default (tries UDP first). Over the public internet, UDP frames may be dropped → jitter → apparent "stall" that the watchdog will chase.

**Why it happens:** `sourceProtocol` was the pre-v1.3 key. CONTEXT.md uses this name. Current MediaMTX expects `rtspTransport` (singular, on the path) or the global `rtspTransports` (plural array).

**How to avoid:** In path config use `rtspTransport: tcp`. Verify by checking MediaMTX debug logs for `[RTSP source] connecting` using TCP.

**Warning signs:** Packet loss in logs, `readTimeout` warnings, frequent muxer recreates.

### Pitfall 2: Treating MediaMTX `ready` as synonymous with "first HLS segment written"

**What goes wrong:** `ready: true` can fire before the first HLS segment is on disk (MediaMTX is "ready" when it has the RTSP description + first sample). If you poll `HLS_DIR` for `.ts` files at the moment of `ready`, you'll find nothing.

**Why it happens:** `ready` = source has tracks; HLS muxer instantiates lazily on first reader (unless `hlsAlwaysRemux: true`).

**How to avoid:** If Phase 6 needs to verify HLS files exist, either (a) set `hlsAlwaysRemux: true` globally so MediaMTX starts muxing immediately, or (b) make a dummy `curl` against `http://localhost:8888/trask/index.m3u8` right after `ready` to trigger muxer instantiation. **Recommendation:** set `hlsAlwaysRemux: true` — aligns with 24/7 goal and guarantees a warm muxer.

### Pitfall 3: Zombie child process on parent crash

**What goes wrong:** If the Node parent dies uncleanly (segfault, OOM), MediaMTX becomes orphaned and reparented to init/systemd. With `detached: false` and systemd's `KillMode=control-group` (default), systemd kills the whole cgroup on service stop — correct. Without systemd, on dev macOS, the orphan survives.

**Why it happens:** POSIX semantics: children survive parent exit unless explicitly killed.

**How to avoid:** `detached: false` is correct (locked). On dev, if the parent crashes, `pkill mediamtx` before restart. Phase 8 systemd unit uses the default `KillMode=control-group` which kills the whole cgroup on stop.

**Warning signs:** `EADDRINUSE` on `:8888` on second dev run.

### Pitfall 4: EPIPE if we try to write to the child's stdin

**What goes wrong:** MediaMTX doesn't read stdin. If our code ever tries `child.stdin.write(...)`, we get EPIPE when MediaMTX has exited.

**How to avoid:** `stdio: ['ignore', 'pipe', 'pipe']` — `stdin` is `'ignore'`, so there's no writable handle to misuse. (Already locked in CONTEXT.md.)

### Pitfall 5: `fetch` poll blocks forever if MediaMTX API hangs

**What goes wrong:** Rare but possible — if the API port is listening but goroutine-starved, a request can hang indefinitely.

**How to avoid:** Always use `fetch(url, { signal: AbortSignal.timeout(2000) })` — 2s is plenty for a localhost request.

### Pitfall 6: Pino `redact` doesn't apply to raw string log lines

**What goes wrong:** `log.info(line)` where `line` is an MediaMTX stdout string containing the RTSP URL → the URL goes straight to stdout without redaction. Pino `redact` only operates on object paths inside log records, not inside message strings.

**How to avoid:** Trust MediaMTX's own redaction (it emits `rtsp://***:***@host:port/path` at `info` level — verified against discussion #3968). Keep `logLevel: info` in generated mediamtx.yml (never `debug`, which reveals the full URL). If paranoid: run child stdout lines through a `replace(/\/\/[^:]+:[^@]+@/, '//***:***@')` filter before logging.

**Warning signs:** grep `pass=` or `:secret` in journald/stdout output during smoke test.

### Pitfall 7: Off-by-one in backoff reset

**What goes wrong:** Resetting the backoff while we're already in `ready` on every poll is cheap; resetting it after a stalled→restart→ready cycle needs to wait the full 60s again.

**How to avoid:** `readyAt` is set only on the `waitingReady → ready` transition. Don't re-stamp it on subsequent polls (the code sample above uses a guarded comparison `Date.now() - readyAt >= 60_000`).

### Pitfall 8: Starting the watchdog poll before `child.spawn` has returned

**What goes wrong:** Poll fires, hits `fetch http://localhost:9997/...` before MediaMTX has bound its API port → `ECONNREFUSED` every 5s for the first 1–2s of boot.

**How to avoid:** Not actually a problem (we downgrade fetch failures to `debug` log). But if noise is objectionable, gate polling on the first successful `fetch` or on `child.spawn`'s `spawn` event (not just the `spawn()` call return).

---

## Code Examples

### MediaMTX Config — Generator (literal template)

```ts
// mediamtx-config.ts
import type { Config } from './config.ts';

export function buildMediamtxYaml(env: Config) {
	return `# generated by packages/stream supervisor — do not edit by hand
logLevel: info
logDestinations: [stdout]
logStructured: false

# Disable everything except RTSP client (source) + HLS server + API
rtsp: no
rtmp: no
srt: no
webrtc: no

api: yes
apiAddress: :${env.MEDIAMTX_API_PORT}

hls: yes
hlsAddress: :${env.MEDIAMTX_HLS_PORT}
hlsAlwaysRemux: yes
hlsVariant: mpegts
hlsSegmentCount: 6
hlsSegmentDuration: 2s
hlsDirectory: ${env.HLS_DIR}
hlsAllowOrigins: ['*']

paths:
  trask:
    source: ${env.RTSP_URL}
    sourceOnDemand: no
    rtspTransport: tcp
`;
}
```

**Notes on keys:**

- `hls: yes` and `rtsp: no` — YAML accepts `yes`/`no`, `true`/`false` — upstream `mediamtx.yml` now uses `true`/`false` but both work. Using `yes`/`no` matches CONTEXT.md wording.
- `rtspTransport: tcp` (NOT `sourceProtocol: tcp` — that was pre-v1.3). This is a **breaking correction** vs CONTEXT.md wording. Verified against upstream `mediamtx.yml` and issue #2545 logs.
- `hlsAlwaysRemux: yes` — **planner must include this** or the muxer sits idle until first HTTP request (then takes several seconds to produce the first segment). For 24/7 always-alive, always-remux.
- `hlsVariant: mpegts` — passthrough H.264 (no transcoding). `fmp4` would also be passthrough but uses `.mp4` segments; `mpegts` uses `.ts` segments which is what success criterion #4 mentions.
- `hlsAllowOrigins: ['*']` — needed so the web client (different origin in Phase 9) can play the stream. Without it, the player can't read the manifest.

### MediaMTX API Poller — exact endpoint + minimal fetch wrapper

```ts
// mediamtx-api.ts
export type PathInfo = {
	ready: boolean;
	bytesReceived: number;
	codec: string | null; // video track codec, e.g. 'H264'
};

export async function getPathInfo(
	apiPort: number,
	path: string,
	timeoutMs = 2_000
): Promise<PathInfo> {
	const res = await fetch(`http://127.0.0.1:${apiPort}/v3/paths/get/${encodeURIComponent(path)}`, {
		signal: AbortSignal.timeout(timeoutMs)
	});
	if (!res.ok) throw new Error(`mediamtx api ${res.status}`);
	const body = (await res.json()) as {
		ready?: boolean;
		bytesReceived?: number;
		tracks?: string[]; // e.g. ['H264', 'MPEG-4 Audio']  (deprecated but stable)
		tracks2?: Array<{ codec: string }>; // v1.17+ preferred
	};

	// Prefer the video codec; fall back to first codec string.
	// Valid video codec labels per internal/formatlabel/label.go:
	//   AV1, VP9, VP8, H265, H264, MPEG-4 Video, MPEG-1/2 Video, M-JPEG
	const VIDEO = new Set([
		'AV1',
		'VP9',
		'VP8',
		'H265',
		'H264',
		'MPEG-4 Video',
		'MPEG-1/2 Video',
		'M-JPEG'
	]);
	const codecs = body.tracks2?.map((t) => t.codec) ?? body.tracks ?? [];
	const videoCodec = codecs.find((c) => VIDEO.has(c)) ?? null;

	return {
		ready: body.ready === true,
		bytesReceived: typeof body.bytesReceived === 'number' ? body.bytesReceived : 0,
		codec: videoCodec
	};
}
```

**API endpoint reference (verified against `internal/defs/api_path.go` + OpenAPI diff in PR #5585):**

- `GET /v3/paths/list` — paginated list (use for debugging).
- `GET /v3/paths/get/{name}` — single path; URL-encode `name`. Returns `{ name, ready, readyTime, available, availableTime, online, onlineTime, source, tracks, tracks2, readers, inboundBytes, outboundBytes, bytesReceived, bytesSent, ... }`.
- API is localhost-only by default (`127.0.0.1`) — no auth needed when polled from the same host.
- Use `bytesReceived` (not `inboundBytes`) for stall detection; `bytesReceived` is the canonical field (both `inboundBytes` and `bytesReceived` return the same uint64; `bytesReceived` is the older, more-widely-documented name).

### Codec string — exact comparison target

From `internal/formatlabel/label.go` (MediaMTX main):

```go
H264      Label = "H264"       // <-- compare string === 'H264'
H265      Label = "H265"
AV1       Label = "AV1"
MPEG4Audio Label = "MPEG-4 Audio"
Opus       Label = "Opus"
```

**Compare with `=== 'H264'` (exact PascalCase, no dot, no space).** Confirmed in live v1.17.1 API response (issue #5668): `"tracks": ["Opus", "AV1"]`.

### Pino — logger factory with redaction

```ts
// logger.ts (updated from Phase 5)
import pino from 'pino';

export function createLogger(opts: { level: string; nodeEnv: string }) {
	const isDev = opts.nodeEnv !== 'production';
	return pino({
		level: opts.level,
		redact: {
			paths: ['RTSP_URL', 'config.RTSP_URL', 'env.RTSP_URL', '*.password', '*.pass'],
			censor: '[REDACTED]'
		},
		transport: isDev
			? {
					target: 'pino-pretty',
					options: {
						colorize: true,
						translateTime: 'SYS:standard',
						ignore: 'pid,hostname'
					}
				}
			: undefined
	});
}
```

**Important:** Pino `redact` operates on object paths in the log record — it does NOT scan arbitrary string messages. So `log.info('password is ' + pwd)` won't be redacted, but `log.info({ password: pwd }, 'auth')` will. Keep that discipline: always pass sensitive fields as structured properties, never concatenate.

### Sanitize helper for boot-log display (optional)

```ts
// lib/url.ts (or inline)
export function redactCredsFromUrl(url: string) {
	try {
		const u = new URL(url);
		if (u.username || u.password) {
			u.username = '***';
			u.password = '***';
		}
		return u.toString();
	} catch {
		return '[invalid-url]';
	}
}
```

Use this when you want a _visible_ version of the URL for debugging: `log.info({ rtspUrl: redactCredsFromUrl(config.RTSP_URL) }, 'supervisor starting')`.

### Phase 5 wiring — exact integration with `createApp`

Update `server.ts` to take a `getStatus` accessor:

```ts
// server.ts
import { Hono } from 'hono';

export type HealthStatus = 'starting' | 'ready' | 'degraded' | 'codec_mismatch' | 'fatal';

export function createApp(opts: { getStatus: () => HealthStatus }) {
	const app = new Hono();
	app.get('/health', (c) => {
		c.header('Cache-Control', 'no-store');
		return c.json({ status: opts.getStatus() satisfies HealthStatus });
	});
	return app;
}
```

And the boot sequence in `index.ts`:

```ts
// index.ts
import { serve } from '@hono/node-server';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { createApp } from './server.ts';
import { Supervisor } from './supervisor.ts';

const config = loadConfig();
const rootLog = createLogger({ level: config.LOG_LEVEL, nodeEnv: config.NODE_ENV });
const log = rootLog.child({ component: 'server' });

// 1. Build supervisor (don't start yet — we need getStatus for the app)
const supervisor = new Supervisor(config, rootLog.child({ component: 'supervisor' }));

// 2. Build app with a live getStatus accessor
const app = createApp({ getStatus: () => supervisor.getStatus() });

// 3. Start HTTP server (Phase 5 behavior preserved)
const server = serve({ fetch: app.fetch, port: config.PORT, hostname: '0.0.0.0' }, (info) =>
	log.info({ port: info.port }, 'stream service listening')
);

// 4. Start supervisor (spawns MediaMTX + starts polling)
void supervisor.start().catch((err) => {
	log.error({ err }, 'supervisor failed to start');
	process.exit(1);
});

// 5. Shutdown: supervisor first, then Hono
async function shutdown(signal: NodeJS.Signals) {
	log.info({ signal }, 'shutdown signal received');
	await supervisor.shutdown();
	server.close((err) => {
		if (err) {
			log.error({ err }, 'error closing server');
			process.exit(1);
		}
		process.exit(0);
	});
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
```

### Phase 5 zod schema — extensions

```ts
// config.ts
import { z } from 'zod';

export const ConfigSchema = z.object({
	// existing (Phase 5)
	NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
	LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
	PORT: z.coerce.number().int().positive().default(8080),

	// Phase 6 additions
	RTSP_URL: z.string().url(),
	MEDIAMTX_API_PORT: z.coerce.number().int().positive().default(9997),
	MEDIAMTX_HLS_PORT: z.coerce.number().int().positive().default(8888),
	HLS_DIR: z.string().default('/run/stream/hls'),
	MEDIAMTX_BIN: z.string().default('mediamtx')
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig() {
	const result = ConfigSchema.safeParse(process.env);
	if (!result.success) {
		process.stderr.write(`FATAL: invalid env:\n${z.prettifyError(result.error)}\n`);
		process.exit(1);
	}
	return result.data;
}
```

---

## Focus-Area Deep Dives

### 1. MediaMTX Config Syntax (current) — confirmed against `v1.17.1`

| CONTEXT.md says                 | Actual current key              | Status                             |
| ------------------------------- | ------------------------------- | ---------------------------------- |
| `sourceProtocol: tcp`           | `rtspTransport: tcp` (per-path) | **CORRECT THIS in the generator**  |
| `hls: yes`                      | `hls: yes` or `hls: true`       | Both work; either fine             |
| `hlsAddress: :${port}`          | `hlsAddress: :${port}`          | ✅                                 |
| `hlsSegmentDuration: 2s`        | `hlsSegmentDuration: 2s`        | ✅                                 |
| `hlsSegmentCount: 6`            | `hlsSegmentCount: 6`            | ✅                                 |
| `hlsVariant: mpegts`            | `hlsVariant: mpegts`            | ✅                                 |
| `hlsDirectory: ${HLS_DIR}`      | `hlsDirectory: ${HLS_DIR}`      | ✅ (empty = RAM, non-empty = disk) |
| `api: yes`                      | `api: yes`                      | ✅                                 |
| `apiAddress: :9997`             | `apiAddress: :9997`             | ✅ default, match env              |
| `rtmp: no, srt: no, webrtc: no` | same                            | ✅                                 |
| `sourceOnDemand: no` (path)     | `sourceOnDemand: false`         | Both work                          |

**Missing but important — include in generator:**

- `hlsAlwaysRemux: yes` — forces muxer to start immediately (else muxer is lazy, spins up on first HTTP GET which can take seconds). **Needed for 24/7 readiness.**
- `hlsAllowOrigins: ['*']` — CORS; required for web client from a different origin (Phase 9 serves the page from the Cloudflare Pages/web package).
- `hlsMuxerCloseAfter: 60s` — default. Safe to leave.
- `rtsp: no` — we are pulling AS a client, not running an RTSP server. Disabling the server-side RTSP saves ports + attack surface.

**Pin:** MediaMTX `v1.17.1` (current stable, released 2026-03-31). Previous 0.x → 1.x migration had breaking renames (`sourceProtocol` → `rtspTransport`, `protocols` → `rtspTransports`). Staying on v1.17.x for the duration of v1.2 keeps us inside a stable config schema.

**Sources:**

- https://github.com/bluenviron/mediamtx/blob/main/mediamtx.yml (full annotated reference)
- https://mediamtx.org/docs/references/configuration-file (v1.17.1 reference)
- https://github.com/bluenviron/mediamtx/releases/tag/v1.17.1

### 2. MediaMTX API Endpoints

| Endpoint                | Method | Purpose                           | Response shape                                                                |
| ----------------------- | ------ | --------------------------------- | ----------------------------------------------------------------------------- |
| `/v3/paths/list`        | GET    | Paginated list of all paths       | `{ pageCount, itemCount, items: APIPath[] }`                                  |
| `/v3/paths/get/{name}`  | GET    | Single path detail — **use this** | `APIPath` (see below)                                                         |
| `/v3/hlsmuxers/list`    | GET    | Active HLS muxers                 | Useful if we want to confirm muxer is alive (not needed for stall detection). |
| `/v3/config/global/get` | GET    | Current config                    | Not needed (we own the config).                                               |

**APIPath response (fields relevant to Phase 6):**

```json
{
  "name": "trask",
  "confName": "trask",
  "ready": true,
  "readyTime": "2026-04-20T...",
  "available": true,
  "online": true,
  "source": { "type": "rtspSource", "id": "..." },
  "tracks": ["H264"],               // deprecated but present; simplest path
  "tracks2": [                      // v1.17+ detailed
    { "codec": "H264", "codecProps": { "profile": "High", "level": "4.0", "width": 2560, "height": 1920, ... } }
  ],
  "readers": [],
  "inboundBytes": 12345678,
  "outboundBytes": 0,
  "bytesReceived": 12345678,
  "bytesSent": 0
}
```

**Auth:** API is localhost-only by default (`apiAddress: :9997` binds to all interfaces BUT MediaMTX's default `authInternalUsers` restricts the `api` action to `127.0.0.1`/`::1`). Since the supervisor runs on the same host, no auth headers needed. Don't change `apiAddress` to a non-loopback interface without also configuring auth.

**Poll load:** `GET /v3/paths/get/trask` on localhost is ~1ms CPU, <1KB response. 5s interval is trivially acceptable.

**Sources:**

- https://mediamtx.org/docs/usage/control-api
- https://github.com/bluenviron/mediamtx/blob/main/internal/defs/api_path.go
- PR #5585 (tracks2 introduction): https://github.com/bluenviron/mediamtx/pull/5585
- Live API sample (issue #5668): https://github.com/bluenviron/mediamtx/issues/5668

### 3. HLS Cache Headers — **CRITICAL FINDING**

**MediaMTX does NOT emit the cache headers required by Success Criterion #4.**

Verified from source (`bluenviron/gohlslib/muxer_stream.go`, constants at top of `muxer.go`):

| Asset                    | MediaMTX emits                | Criterion #4 requires                             | Match? |
| ------------------------ | ----------------------------- | ------------------------------------------------- | ------ |
| `.m3u8` (media playlist) | `Cache-Control: no-cache`     | `Cache-Control: public, max-age=1`                | ❌     |
| `.m3u8` (multivariant)   | `Cache-Control: max-age=30`   | `Cache-Control: public, max-age=1`                | ❌     |
| `init.mp4` (fmp4 only)   | `Cache-Control: max-age=30`   | n/a (mpegts variant, no init)                     | —      |
| `.ts` / `.mp4` segment   | `Cache-Control: max-age=3600` | `Cache-Control: public, max-age=86400, immutable` | ❌     |

These are **hardcoded** in gohlslib (`segmentMaxAge = "3600"`, `multivariantPlaylistMaxAge = "30"`, media playlist `no-cache`). No config option to override.

**Source:** https://github.com/bluenviron/gohlslib/blob/main/muxer.go (constants block) and `muxer_stream.go` (header setters).

**Resolution path — needs user decision (see `## Open Questions #1`). Recommendation: move criterion #4 cache-header clause to Phase 8** (Caddy/nginx reverse proxy in front of MediaMTX rewrites Cache-Control). Phase 6 verification falls back to checking segment duration (2s), window size (6 segments), and file placement — all of which MediaMTX DOES satisfy.

### 4. `EXT-X-DISCONTINUITY` on Muxer Restart — **CRITICAL FINDING**

**MediaMTX does NOT emit `EXT-X-DISCONTINUITY` on any event.** Instead, when the source disconnects + reconnects, the HLS muxer is destroyed (all `.ts` segments deleted — discussion #2500) and recreated with:

- A new random prefix (e.g., `ce0c22ee188c_seg29.ts` → after restart → `a4f9d3b1022c_seg0.ts`).
- `#EXT-X-MEDIA-SEQUENCE:0` restart.
- Fresh `_init.mp4` (fmp4 variant) or no-init (mpegts).

From the hls.js client's perspective: playlist URL is unchanged, but its contents are fully reset. hls.js treats this as a stream reset (issue #4309 confirms this pattern with Nimble Streamer; hls.js stalls without `EXT-X-DISCONTINUITY`). **This is a known rough-edge across HLS packagers, not MediaMTX-specific.**

**Options:**

- **Accept behavior as-is:** functionally equivalent to discontinuity (client buffer flushes, new segments load). Client-side `hls.js` recovery in Phase 9 handles this (`LEVEL_LOADED` resets, `BUFFER_NUDGE`, etc.).
- **Soften criterion #2:** change wording from "resumes video with `EXT-X-DISCONTINUITY` in the manifest" to "resumes video (manifest resets with new `MEDIA-SEQUENCE:0` and fresh segment prefix, which hls.js handles as a stream reset)".
- **Work around server-side:** not realistic — would require patching MediaMTX or running a transcoder that buffers across disconnects.

**Recommendation:** soften criterion #2 to reflect actual MediaMTX behavior. Document in Phase 6 SUMMARY that the supervisor's restart + MediaMTX's internal recreate together produce a reset-playlist pattern that hls.js v1.5+ handles gracefully. Real client recovery is validated in Phase 9.

**Sources:**

- https://github.com/bluenviron/mediamtx/discussions/2500 (muxer destroyed on source close)
- https://github.com/video-dev/hls.js/issues/4309 (client behavior when packager resets MEDIA-SEQUENCE)
- `bluenviron/gohlslib/muxer_stream.go` (no `EXT-X-DISCONTINUITY` tag emitted in playlist generation)

### 5. Node `child_process.spawn` Patterns — long-lived supervised children

**Correct stdio for line-buffered capture:**

```ts
spawn(bin, args, {
	stdio: ['ignore', 'pipe', 'pipe'], // no stdin; pipe stdout + stderr
	detached: false,
	env: process.env
});
```

**Line-buffering:**

```ts
import { createInterface } from 'node:readline';
createInterface({ input: child.stdout! }).on('line', (line) => log.info(line));
```

`readline.createInterface` handles partial chunks, CRLF/LF, and UTF-8 boundaries. Don't manually split on `\n` — you'll mangle multi-byte characters on chunk boundaries.

**Avoid zombie children:**

- `detached: false` — child is in parent's process group; dies with parent on most signals.
- Under systemd (Phase 8), `KillMode=control-group` (systemd default) kills the whole cgroup on service stop — reliable even on SIGKILL of the parent.
- On dev macOS, if the parent is SIGKILL'd, MediaMTX may survive — `pkill -f mediamtx` manually. Not a code bug; just dev hygiene.

**EPIPE:** Not applicable — `stdin` is `'ignore'`, so there's no writable handle. If you later enable stdin, wrap writes in `try/catch` and listen for `'error'` on `child.stdin`.

**Distinguishing "we killed it" from "it crashed":**

```ts
class Supervisor {
	private intentionalStop = false;
	// ... in shutdown(): set intentionalStop = true, then kill.
	// ... in 'exit' handler: if (intentionalStop || state.kind === 'shuttingDown') return; // else restart
}
```

Alternative: check `signal === 'SIGTERM'` in the exit handler AND state machine is in `shuttingDown`. The flag approach is simpler.

**Verify child actually spawned before starting watchdog:**

```ts
child.once('spawn', () => {
	/* safe to start polling */
});
// vs
child.once('error', (err) => {
	/* binary not found, ENOENT */
});
```

The `error` event fires before `exit` if spawn itself failed (e.g., `MEDIAMTX_BIN` not found). Log this at `fatal` level and exit — no point backing off forever against a missing binary.

**Sources:**

- Node 22 docs: https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
- Node 22 docs: https://nodejs.org/api/readline.html#readlinecreateinterfaceoptions

### 6. Exponential Backoff Reset Logic — canonical pattern

**State:**

```ts
let backoffMs = BACKOFF_INITIAL_MS; // 1000
let readyAt: number | null = null;
```

**Grow on restart:** `backoffMs = Math.min(BACKOFF_MAX_MS, backoffMs * 2)` → 1s, 2s, 4s, 8s, 16s, 30s, 30s, ...

**Reset:** Inside the poll handler, when `state.kind === 'ready'`, compare `Date.now() - state.readyAt >= CLEAN_UPTIME_MS (60_000)`. If the condition flips true, set `backoffMs = BACKOFF_INITIAL_MS` and log the reset. Set `readyAt` exactly once on the `waitingReady → ready` transition; do NOT re-stamp it on subsequent polls.

**Timer cleanup on shutdown:**

```ts
if (restartTimer) clearTimeout(restartTimer);
if (pollTimer) clearInterval(pollTimer);
```

Both clearTimeout/clearInterval are safe even if the handle is already fired (no-op).

### 7. Phase 5 Wiring — exact integration points

Already demonstrated in `§ Code Examples — Phase 5 wiring`. Summary:

- `createApp()` → `createApp({ getStatus })` — minor API break; Phase 5 callers update.
- `index.ts` boot order: **config → logger → SUPERVISOR (constructed, not started) → APP (with getStatus) → Hono server → supervisor.start() → signal handlers**.
- Shutdown order: **supervisor.shutdown() → server.close() → process.exit(0)**. Reverse of startup; MediaMTX child must be gone before we exit, else journald shows a dangling "mediamtx still running" log.
- Phase 5 smoke test (`bun check`, `node --check dist/index.js`) still passes: the new files use only Node built-ins + existing deps.

### 8. MediaMTX Binary on Ubuntu Droplet (Phase 8 concern — noted here for dev smoke)

- **No official apt package.** Distribution is GitHub Releases only.
- **Tarball:** `mediamtx_v1.17.1_linux_amd64.tar.gz` (24.9 MB). Extract yields a single `mediamtx` ELF binary + `mediamtx.yml` reference + `LICENSE`.
- **SHA256 + attestation:** `checksums.sha256` in the release; bonus: GitHub blockchain attestations via `gh attestation verify --repo bluenviron/mediamtx`.
- **Phase 8 install path:** `/usr/local/bin/mediamtx` + `/usr/local/etc/mediamtx.yml` (per upstream systemd guide). Phase 6 doesn't touch this; `MEDIAMTX_BIN` default of `'mediamtx'` assumes it's on `$PATH`.
- **Local dev (macOS arm64):** `brew install` is NOT available. Pull `mediamtx_v1.17.1_darwin_arm64.tar.gz`, drop binary in `~/bin` or set `MEDIAMTX_BIN=./vendor/mediamtx/mediamtx` as a dev env override. Do NOT vendor the binary in the repo (CONTEXT.md locked).
- **Breaking config history:** v0.x → v1.x (2023) renamed `sourceProtocol` → `rtspTransport`, `protocols` → `rtspTransports`, added path-level overrides. v1.x → v1.17 has been additive only. **Pinning v1.17.1 for all of v1.2 avoids drift.**

**Sources:**

- https://github.com/bluenviron/mediamtx/releases/tag/v1.17.1
- https://mediamtx.org/docs/usage/start-on-boot (systemd unit pattern)

### 9. Pino Redaction — exact syntax + limitation

**Structured field redaction works:**

```ts
pino({
	redact: {
		paths: ['RTSP_URL', 'config.RTSP_URL', '*.password'],
		censor: '[REDACTED]'
	}
});
log.info({ config }, 'boot'); // config.RTSP_URL -> '[REDACTED]'
log.info({ password: 'x' }, 'oops'); // password -> '[REDACTED]'
```

**String-message redaction does NOT work:**

```ts
log.info('rtsp url is ' + config.RTSP_URL); // LEAKS — redact does not scan strings
```

**Solution: MediaMTX already redacts its own logs** at `logLevel: info` — discussion #3968 confirms credentials appear as `rtsp://***:***@host:port/path`. As long as our generated `mediamtx.yml` has `logLevel: info` (never `debug`), the child's stdout is safe to forward verbatim.

**Defense in depth (optional):** in the stdout forwarder, apply `line.replace(/\/\/[^:\s]+:[^@\s]+@/g, '//***:***@')` before `log.info(line)`. Cheap and removes any residual risk.

**Sources:**

- https://github.com/pinojs/pino/blob/v10.1.0/docs/redaction.md
- https://github.com/bluenviron/mediamtx/discussions/3968

### 10. Local Verification Without a Real Camera

**Simplest:** point `RTSP_URL` at the production camera from a dev laptop (VPN or public RTSP creds). This is what the camera will be in prod anyway; no simulation needed.

**Fallback — ffmpeg publishes a test H.264 stream to a local RTSP relay:**

```bash
# In terminal 1: a second MediaMTX running as RTSP server on :18554
cat > /tmp/mtx-publisher.yml <<'EOF'
rtsp: yes
rtspAddress: :18554
api: no
hls: no
rtmp: no
srt: no
webrtc: no
paths:
  testcam:
    source: publisher
EOF
mediamtx /tmp/mtx-publisher.yml

# In terminal 2: ffmpeg generates a 2s-GOP H.264 test pattern and publishes
ffmpeg -re -f lavfi -i "testsrc=size=1280x720:rate=30" \
       -c:v libx264 -preset veryfast -tune zerolatency \
       -g 60 -keyint_min 60 -sc_threshold 0 \
       -pix_fmt yuv420p -b:v 4M \
       -f rtsp -rtsp_transport tcp rtsp://127.0.0.1:18554/testcam

# In terminal 3: our supervisor points at it
export RTSP_URL=rtsp://127.0.0.1:18554/testcam
export HLS_DIR=./run/hls
export MEDIAMTX_API_PORT=9997
export MEDIAMTX_HLS_PORT=8888
mkdir -p ./run/hls
bun --filter=@traskriver/stream dev
```

**To test H.265 rejection (criterion #3):** swap `libx264` for `libx265` and restart ffmpeg. The supervisor's codec guard should log `FATAL: camera codec is H265, expected H264` and exit non-zero.

**To test stall detection (criterion #4 stall path):** SIGSTOP the ffmpeg process: `kill -STOP <pid>`. MediaMTX API `ready` stays true but `bytesReceived` stops advancing. After 75s, supervisor restarts MediaMTX. `kill -CONT <pid>` to resume.

**To test kill-restart (criterion #1):** `kill -9 $(pgrep mediamtx)`. Supervisor's `child.on('exit')` fires; scheduleRestart kicks in with current backoff; MediaMTX comes back up. Repeat rapidly to watch backoff grow 1→2→4→8→16→30s; wait 60s clean and watch it reset to 1s.

### 11. Codec Name Normalization — confirmed string values

MediaMTX's codec label type (source: `internal/formatlabel/label.go`, fetched 2026-04-20):

| Codec              | API string value |
| ------------------ | ---------------- |
| H.264              | `"H264"`         |
| H.265              | `"H265"`         |
| AV1                | `"AV1"`          |
| VP9                | `"VP9"`          |
| M-JPEG             | `"M-JPEG"`       |
| MPEG-4 Audio (AAC) | `"MPEG-4 Audio"` |
| Opus               | `"Opus"`         |

**Compare with `=== 'H264'`** (no dot, PascalCase, no space). Live verification: API sample in issue #5668 shows `"tracks": ["Opus", "AV1"]` — exact casing.

The codec check in Phase 6 looks only at video tracks (filter out `Opus`, `MPEG-4 Audio`). See `getPathInfo` helper in `§ Code Examples`.

---

## State of the Art

| Old Approach                    | Current Approach (v1.17.1)               | When Changed                 | Impact                                                           |
| ------------------------------- | ---------------------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| `sourceProtocol: tcp`           | `rtspTransport: tcp` (per-path)          | v1.3+                        | CONTEXT.md wording must be corrected in generator                |
| `protocols: [tcp]` (global)     | `rtspTransports: [tcp]` (global, plural) | v1.3+                        | Same rename pattern                                              |
| `/v2/paths/list`                | `/v3/paths/list`                         | v1.0 (stable API since v1.0) | Use v3                                                           |
| `tracks: [codec-string]` in API | `tracks2: [{ codec, codecProps }]`       | v1.17 (March 2026)           | Old `tracks` still present; both work. Use whichever is simpler. |
| `authInternalUsers` list format | `authInternalUsers` list format          | stable                       | Unchanged                                                        |

**Deprecated but functional:** `tracks` (array of codec strings) — kept for backwards compat; replaced by `tracks2`. Safe to use either; `tracks` is simpler.

---

## Open Questions

### 1. Cache headers at `localhost:8888` don't match Success Criterion #4 (HIGH priority)

**What we know:** MediaMTX (via gohlslib) emits `Cache-Control: no-cache` on `.m3u8` and `Cache-Control: max-age=3600` on `.ts`. Hardcoded; no config.

**What's unclear:** Is criterion #4's `public, max-age=1` + `public, max-age=86400, immutable` requirement tied specifically to the `localhost:8888` endpoint (MediaMTX direct), or can it be satisfied by the Phase-8 reverse proxy at `https://stream.traskriver.com`?

**Recommendation:**

- Move criterion #4's cache-header clause from Phase 6 to Phase 8 (when Caddy/nginx rewrites headers).
- Phase 6 success criterion #4 retains: 2s segment duration, 6-segment window, file placement, served by MediaMTX's HTTP port — all of which MediaMTX DOES satisfy.
- Document in Phase 6 SUMMARY that native MediaMTX cache headers are not the production values; rewrite is delegated to Phase 8 reverse proxy.

**Decision required from user before planning proceeds.**

### 2. `EXT-X-DISCONTINUITY` on reconnect (Success Criterion #2) — MediaMTX doesn't emit it

**What we know:** MediaMTX destroys the HLS muxer on source disconnect; on reconnect, creates a new muxer with fresh random prefix + `MEDIA-SEQUENCE:0`. No `EXT-X-DISCONTINUITY` tag is ever emitted.

**What's unclear:** Is the criterion wording intended literally (the tag must appear), or is the intent "client video should resume playing after camera reconnect"?

**Recommendation:**

- Soften criterion #2 wording: "Unplugging the camera for ≥90s flips the supervisor out of `ready` and triggers a supervised restart; reconnect resumes video (manifest resets with fresh `MEDIA-SEQUENCE:0` + new segment prefix, which hls.js handles as a stream reset)."
- Phase 9 client-side recovery (hls.js `LEVEL_LOADED` watcher, `BUFFER_NUDGE`) handles the reset.

**Decision required from user before planning proceeds.**

### 3. `hlsAlwaysRemux: yes` not explicitly in CONTEXT.md — should be added

**What we know:** Without `hlsAlwaysRemux`, MediaMTX's HLS muxer is lazy: it starts when the first HTTP client hits `/trask/index.m3u8`. For 24/7 service + smoke tests that curl the manifest, this adds a 2-5s cold-start delay every time readers disconnect.

**What's unclear:** Is this an acceptable Claude-discretion add, or does it need explicit user sign-off given CONTEXT.md's enumerated config lines?

**Recommendation:** Add `hlsAlwaysRemux: yes`. Matches "always-alive 24/7" intent. Flag in PLAN for user review.

---

## Sources

### Primary (HIGH confidence)

- Context7 library `/bluenviron/mediamtx` (code snippets 481, source reputation HIGH) — HLS config, API shape
- MediaMTX upstream `mediamtx.yml` (current, fetched 2026-04-20): https://github.com/bluenviron/mediamtx/blob/main/mediamtx.yml
- MediaMTX upstream source for codec label strings: https://raw.githubusercontent.com/bluenviron/mediamtx/main/internal/formatlabel/label.go
- MediaMTX upstream source for HLS HTTP server: https://github.com/bluenviron/mediamtx/blob/main/internal/servers/hls/http_server.go
- gohlslib upstream source for cache headers: https://github.com/bluenviron/gohlslib/blob/main/muxer.go, https://github.com/bluenviron/gohlslib/blob/main/muxer_stream.go
- MediaMTX OpenAPI diff + track fields (PR #5585): https://github.com/bluenviron/mediamtx/pull/5585 (commit `2b302e7`, merged 2026-03-17)
- MediaMTX release v1.17.1 (2026-03-31): https://github.com/bluenviron/mediamtx/releases/tag/v1.17.1
- Context7 library `/pinojs/pino` v10.1.0 — `redact` option
- Node 22 built-in docs: `child_process`, `readline`, `fetch`, `AbortSignal` (https://nodejs.org/api/)

### Secondary (MEDIUM confidence — verified with official source)

- MediaMTX docs site: https://mediamtx.org/docs/references/configuration-file (v1.17.1 reference, cross-referenced with upstream `mediamtx.yml`)
- MediaMTX docs site: https://mediamtx.org/docs/usage/control-api
- MediaMTX start-on-boot / systemd guide: https://mediamtx.org/docs/usage/start-on-boot
- Live API response sample (issue #5668): https://github.com/bluenviron/mediamtx/issues/5668 — confirmed `tracks` / `tracks2` shape + codec casing

### Tertiary (context only)

- hls.js issue #4309 (client stalls on `MEDIA-SEQUENCE` reset without `EXT-X-DISCONTINUITY`): https://github.com/video-dev/hls.js/issues/4309
- Discussion #2500 (HLS muxer destroyed on source close): https://github.com/bluenviron/mediamtx/discussions/2500
- Discussion #3968 (RTSP credential redaction in logs at `info` level): https://github.com/bluenviron/mediamtx/discussions/3968

---

## Metadata

**Confidence breakdown:**

- Standard stack — HIGH — pinned to v1.17.1; verified against upstream source + docs; no new npm deps.
- MediaMTX config syntax — HIGH — verified against current `mediamtx.yml` (32.7KB annotated). Includes correction of `sourceProtocol` → `rtspTransport`.
- MediaMTX API endpoints + response shape — HIGH — verified against `internal/defs/api_path.go` source + OpenAPI diff + live API sample.
- Codec string values — HIGH — verified against `internal/formatlabel/label.go` source + live API sample.
- HLS cache headers finding — HIGH — verified against `bluenviron/gohlslib` source constants + upstream logs.
- `EXT-X-DISCONTINUITY` finding — HIGH — verified against `gohlslib/muxer_stream.go` playlist generation (no discontinuity logic) + discussion #2500.
- Node `child_process.spawn` patterns — HIGH — standard Node 22 API, well-documented.
- Backoff + shutdown logic — HIGH — canonical pattern, code sample provided.
- Pino redaction — HIGH — verified against `/pinojs/pino` v10.1.0 docs.
- Phase 5 wiring — HIGH — inspected `packages/stream/src/*.ts` directly.

**Research date:** 2026-04-20
**Valid until:** 2026-07-20 (MediaMTX v1.17.1 stable; Node 22 LTS; no imminent upstream breaking changes known)

---

## RESEARCH COMPLETE

**Phase:** 6 — MediaMTX Supervisor + RTSP Ingest
**Confidence:** HIGH

### Key Findings

1. **`sourceProtocol: tcp` in CONTEXT.md is obsolete** — current MediaMTX v1.17.1 key is `rtspTransport: tcp` (per-path). Generator must use current key.
2. **HLS cache headers required by criterion #4 are not emittable by MediaMTX** — `Cache-Control: no-cache` / `max-age=3600` are hardcoded in gohlslib, no config override. Needs user decision; recommend moving to Phase 8 reverse proxy.
3. **`EXT-X-DISCONTINUITY` on muxer restart is not emitted by MediaMTX** — instead the muxer is destroyed + recreated with fresh prefix and `MEDIA-SEQUENCE:0`. Functionally equivalent; criterion #2 wording should be softened.
4. **Codec values in MediaMTX API are PascalCase strings** — `"H264"` exactly (no dot, no space). Use `tracks` (deprecated, simple) or `tracks2[].codec` (v1.17+).
5. **`hlsAlwaysRemux: yes` should be added** to the generator — forces warm muxer, matches 24/7 intent; not in CONTEXT.md but a sensible discretion call.
6. **Pin MediaMTX v1.17.1** (released 2026-03-31) — gives us `tracks2` and stable config schema; no binary provisioning in Phase 6 (Phase 8 handles).
7. **No new npm deps needed** — Node 22 built-ins (`child_process`, `readline`, `fetch`, `AbortSignal`) plus existing `pino` / `zod` / `hono`.

### File Created

`.planning/phases/06-mediamtx-supervisor-rtsp-ingest/06-RESEARCH.md`

### Confidence Assessment

| Area           | Level | Reason                                                                                               |
| -------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| Standard Stack | HIGH  | Versions verified against GitHub releases; no new deps; Node 22 built-ins                            |
| Config syntax  | HIGH  | Verified against upstream `mediamtx.yml` and config reference docs                                   |
| API shape      | HIGH  | Verified against upstream source + live response samples                                             |
| Node patterns  | HIGH  | Standard `child_process.spawn` + `readline` patterns; canonical backoff                              |
| Pitfalls       | HIGH  | Rooted in upstream source, live issues, and verified behavioral findings (cache headers, disc. tags) |

### Open Questions (for user / planner)

1. **Cache headers (criterion #4):** relax Phase 6 check to "segments/window/placement" and move cache-header verification to Phase 8 reverse proxy — **YES / NO**?
2. **`EXT-X-DISCONTINUITY` (criterion #2):** soften wording to "manifest resets cleanly, client recovers" — **YES / NO**?
3. **Add `hlsAlwaysRemux: yes`** to the MediaMTX config generator — **YES / NO**? (Strongly recommend YES.)

### Ready for Planning

Research complete. Two blockers (cache headers, EXT-X-DISCONTINUITY) need user acknowledgment; everything else is actionable. Planner can proceed by either (a) asking the user the three questions above, or (b) planning the code as described and deferring the criteria-relaxation decision to verification time.
