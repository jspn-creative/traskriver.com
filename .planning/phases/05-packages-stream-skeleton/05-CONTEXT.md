# Phase 5: `packages/stream` Skeleton - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Create a new `packages/stream` Node 22 ESM workspace package that builds cleanly against a Node-target tsconfig, boots with zod-validated env, emits Pino JSON logs (pino-pretty in dev), and serves a placeholder `/health` returning `{ status: "starting" }`. This is scaffolding only — Phase 6 hangs the MediaMTX supervisor onto it; Phase 7 expands `/health`; Phase 8 deploys it.

Out of scope for Phase 5: MediaMTX, RTSP ingest, stall watchdog, codec guard, full `/health` payload, systemd, TLS, DNS, deployment.

</domain>

<decisions>
## Implementation Decisions

### HTTP Library

- **Hono.** Locked. Small, fast, first-class Node adapter (`@hono/node-server`), typed routing. No Fastify, no Elysia, no raw `node:http`.

### Build & Runtime Toolchain

- **One mode, not two.** Same server, same zod schema, same Pino logger, same `.env`, same Hono app in dev and prod. Only difference: dev reads `.ts` source; prod runs compiled `dist/*.js`.
- **Prod build: `tsc` emit.** Zero extra deps, deterministic file layout, no bundler shims. Must satisfy `node --check dist/index.js` (success criterion).
- **Dev runner: `node --experimental-strip-types --watch src/index.ts`.** Zero extra deps, prod-matching runtime, restart on file change. No `tsx`, no `nodemon`, no Bun at runtime.
- **Runtime: Node 22.** `"type": "module"`, `"engines": { "node": ">=22" }`.
- **No `bun-types`, no `@types/bun`.** Stream runs on Node, not Bun. Use `@types/node`.
- **Bun is still the package manager and monorepo driver.** `bun install`, `bun run --filter=stream build`, turbo-orchestrated.

### tsconfig (Node-target)

- Extends repo root `tsconfig.json` (ES2022, strict, ESM).
- **Overrides:** `lib: ["ES2023"]` (no DOM, no WebWorker), `types: ["node"]`, `outDir: "./dist"`, `rootDir: "./src"`, `noEmit: false`, `declaration: false`, `sourceMap: true`, `moduleResolution: "nodenext"`, `module: "nodenext"`.
- `include: ["src/**/*"]`.

### Config (zod)

- **Minimal Phase 5 schema.** Only vars actually read by the skeleton:
  - `NODE_ENV` — `"development" | "production" | "test"`, default `"production"`
  - `LOG_LEVEL` — `"trace" | "debug" | "info" | "warn" | "error" | "fatal"`, default `"info"`
  - `PORT` — number, default `8080` (ops-only `/health` port; public HLS is served by MediaMTX in Phase 6, not by Hono)
- **Fail fast on invalid env.** `schema.parse(process.env)` at boot; log zod issue list via Pino and `process.exit(1)` before any server starts.
- **Phase 6 adds its own vars** (RTSP URL, camera creds, MediaMTX API port, segment dir) when it actually reads them. No forward-declared optional stubs.

### Logging (Pino)

- **Pino JSON to stdout in prod.** No file logging; journald captures stdout in Phase 8.
- **`pino-pretty` in dev only.** Gated on `NODE_ENV !== "production"`. Installed as a devDependency; must not ship in prod dependency graph.
- **Child logger pattern.** Root logger at boot; pass `log.child({ component: "..." })` into modules so Phase 6 supervisor/watchdog/codec-guard tag their output.
- **Level from `LOG_LEVEL`** (validated by zod).

### `/health` Endpoint

- **Body:** literal `{ status: "starting" }` for Phase 5.
- **Status enum typed forward-compatibly now** so Phase 6/7 add fields without redesigning state:
  ```ts
  type HealthStatus = 'starting' | 'ready' | 'degraded' | 'codec_mismatch' | 'fatal';
  ```
- **Response headers:** `Content-Type: application/json`, `Cache-Control: no-store`.
- **Binding:** Phase 5 binds Hono to `0.0.0.0:${PORT}`. Ops-only interface restriction (Tailscale / `ops.*` host) is a Phase 7/8 concern, not 5.
- **No other routes.** `/` is not implemented. Unknown paths → 404.

### Entry Point & Lifecycle

- `src/index.ts`: load env → parse zod → construct root Pino logger → construct Hono app → register `/health` → start `@hono/node-server` → log `"stream service listening"` with port.
- **Signal handling:** `SIGTERM` and `SIGINT` → log shutdown → call `server.close()` → `process.exit(0)`. Phase 6 extends this to tear down MediaMTX first (10s grace → SIGKILL per STRM-02); Phase 5 just closes the HTTP server.
- No supervisor state machine, no child processes, no timers, no watchdogs in Phase 5.

### Workspace Wiring

- Add `packages/stream` to root `package.json` `workspaces` array (alongside `web`, `relay`, `shared`).
- **Package name:** `@traskriver/stream`.
- Scripts on the package:
  - `"dev"` — `node --experimental-strip-types --watch src/index.ts`
  - `"build"` — `tsc`
  - `"start"` — `node dist/index.js`
  - `"check"` — `tsc --noEmit`
- `turbo.json`: existing `build` and `check` tasks already cover the new package; `build.outputs` should include `packages/stream/dist/**`.
- Root `package.json`: no new top-level scripts required; `bun run build`, `bun run check` already fan out via turbo.
- **Do NOT touch `packages/relay`.** Deletion happens in Phase 9.

### Directory Layout

```
packages/stream/
├── package.json
├── tsconfig.json
├── README.md              (brief: what this is, how to run, links to phase docs)
├── .gitignore             (dist/, node_modules/)
└── src/
    ├── index.ts           (entry — boot sequence)
    ├── config.ts          (zod schema + parse)
    ├── logger.ts          (Pino root logger factory)
    └── server.ts          (Hono app factory + /health route)
```

### Claude's Discretion

- Exact Pino formatter options for `pino-pretty` (colorize, translateTime, ignore fields).
- Whether `server.ts` exposes a `createApp()` factory or a module-level `app` const — planner picks based on testability needs in Phase 6.
- Internal file splits if any of the four src files grow awkwardly.
- README.md content and tone.

### Folded Todos

None — no pending todos matched this phase.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase inputs

- `.planning/ROADMAP.md` §"Phase 5: `packages/stream` Skeleton" — success criteria (5 items)
- `.planning/REQUIREMENTS.md` §STRM-01 — the single requirement Phase 5 satisfies
- `.planning/PROJECT.md` §"Context" and §"Constraints" — v1.2 pipeline target, VPS expectation, CI/CD out of scope
- `.planning/STATE.md` — current milestone position

### Downstream phase context (for forward-compat choices)

- `.planning/ROADMAP.md` §"Phase 6" — supervisor spawns on top of this skeleton; backoff + SIGTERM→SIGKILL behavior
- `.planning/ROADMAP.md` §"Phase 7" — full `/health` payload shape that the status enum must accommodate
- `.planning/ROADMAP.md` §"Phase 9" — `packages/relay` deletion + workspace cleanup (explains why not to borrow relay's Bun-target patterns)

### Workspace conventions

- `.planning/codebase/CONVENTIONS.md` — Prettier config (tabs, single quotes, no trailing comma, printWidth 100), no ESLint, strict TS
- `.planning/codebase/STRUCTURE.md` — monorepo layout pattern; where `packages/<name>/` sits
- `.planning/codebase/STACK.md` — existing Bun + Turbo + workspace setup
- `AGENTS.md` §"Learned User Preferences" — user deploys via DigitalOcean/xCloud; do not plan around deploy providers; Bun is package manager
- Root `tsconfig.json` — base config Phase 5's tsconfig extends

### Relay (reference only — do not copy Bun-specific code)

- `packages/relay/src/index.ts` — pattern reference for boot sequence, signal handling, config validation (but relay uses `Bun.serve`, `Bun.spawnSync`, `bun-types` — none of which apply to Node target)
- `packages/relay/src/health-server.ts` — pattern reference for minimal health endpoint (Bun-specific; rewrite for Hono + Node)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Repo root `tsconfig.json`** — strict ES2022 ESM base; stream's tsconfig extends it and overrides `lib`/`types`/`outDir`/`noEmit`/`module`.
- **Prettier config** at `packages/web/.prettierrc` — stream inherits via root `bunx prettier` (already in `bun format`).
- **Turbo `build`/`check` tasks** — already wildcard-apply to new workspace packages; `build.outputs` needs `packages/stream/dist/**` added.
- **`packages/shared`** — exists, but stream does NOT import from it in Phase 5 (all relay/demand/JWT types are being purged in Phase 7; no shared types are relevant to a zod+Pino+Hono skeleton).

### Established Patterns

- **Workspace package shape:** `packages/<name>/{package.json, tsconfig.json, src/, README.md}` — mirror from `packages/relay` (structure only, not toolchain).
- **Strict TS, no ESLint:** quality gate is `prettier --check` + `tsc --noEmit`. Stream adheres.
- **`process.env` at boot + fail fast on missing required vars:** relay does this imperatively (`if (!config.streamUrl) process.exit(1)`); stream does the same with zod's aggregated error output.
- **Named signal handlers for graceful shutdown:** relay pattern (`SIGTERM`/`SIGINT` → cleanup → `process.exit(0)`) — stream adopts, minus ffmpeg/reporter teardown.
- **Logger wrapper module:** relay has `src/logger.ts` exporting a single `log` object; stream does analogous but with Pino instead of `console.*`.

### Integration Points

- Root `package.json` `workspaces` array — add `"packages/stream"`.
- `turbo.json` `tasks.build.outputs` — add `"packages/stream/dist/**"`.
- No changes to `packages/web`, `packages/relay`, `packages/shared` in Phase 5.
- No changes to `wrangler.jsonc`, `.env`, or any web route in Phase 5.

### Anti-patterns to Avoid

- **Do not use `bun build`, `Bun.serve`, `Bun.spawn`, or `bun-types`** in `packages/stream`. Target is Node 22, not Bun. Relay's toolchain does not transfer.
- **Do not include DOM or Workers types** in stream's tsconfig `lib` — Phase 5 success criterion 1 is explicit.
- **Do not forward-declare env vars** that Phase 5 doesn't actually read; Phase 6 adds its own.
- **Do not add a second "dev config"** or `.env.development` — one mode, one schema, one `.env`.
- **Do not clone from `packages/relay`'s `index.ts`** — it's Bun-specific and getting deleted in Phase 9.

</code_context>

<specifics>
## Specific Ideas

- **"One mode, not two."** User explicitly rejected a separate dev toolchain. Dev and prod are the same server with different entry (source vs compiled). This informs: no dev-only config, no dev-only middleware, no `NODE_ENV`-branched logic beyond Pino pretty-printing.
- Phase 5 is deliberately narrow — "scaffolding for Phase 6 to hang on." Resist adding anything not required by the 5 success criteria.

</specifics>

<deferred>
## Deferred Ideas

- Full `/health` payload (rtspConnected, codec, lastSegmentWrittenAgoMs, restartsLast1h, uptimeMs) — **Phase 7**
- Ops-only binding for `/health` (Tailscale / `ops.*` host) — **Phase 7 or 8**
- MediaMTX spawn/supervisor, backoff, stall watchdog, codec guard — **Phase 6**
- RTSP/camera env vars and validation — **Phase 6**
- systemd unit, TLS, DNS, runtime directory on tmpfs — **Phase 8**
- Phase 9 repo cleanup (delete `packages/relay`, purge shared types, wrangler bindings) — **Phase 9**

</deferred>

---

_Phase: 05-packages-stream-skeleton_
_Context gathered: 2026-04-20_
