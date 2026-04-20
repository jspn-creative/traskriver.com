# Phase 5: `packages/stream` Skeleton - Research

**Researched:** 2026-04-20
**Domain:** Node 22 ESM service skeleton (Hono + Pino + zod), tsc build + `node --experimental-strip-types --watch` dev
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**HTTP Library:** Hono (via `@hono/node-server`). No Fastify, no Elysia, no raw `node:http`.

**Build & Runtime Toolchain:**

- One mode, not two — same server, same zod schema, same Pino logger, same `.env`, same Hono app in dev and prod. Only difference: dev reads `.ts` source; prod runs compiled `dist/*.js`.
- Prod build: `tsc` emit. Must satisfy `node --check dist/index.js`.
- Dev runner: `node --experimental-strip-types --watch src/index.ts`. No `tsx`, no `nodemon`, no Bun at runtime.
- Runtime: Node 22. `"type": "module"`, `"engines": { "node": ">=22" }`.
- No `bun-types`, no `@types/bun`. Use `@types/node`.
- Bun remains package manager and monorepo driver (`bun install`, `bun run --filter=stream build`, turbo-orchestrated).

**tsconfig (Node-target):** Extends repo root; overrides `lib: ["ES2023"]`, `types: ["node"]`, `outDir: "./dist"`, `rootDir: "./src"`, `noEmit: false`, `declaration: false`, `sourceMap: true`, `moduleResolution: "nodenext"`, `module: "nodenext"`. `include: ["src/**/*"]`.

**Config (zod):** Minimal Phase 5 schema only — `NODE_ENV` (`development|production|test`, default `production`), `LOG_LEVEL` (`trace|debug|info|warn|error|fatal`, default `info`), `PORT` (number, default `8080`). Fail-fast at boot via Pino + `process.exit(1)`. Phase 6 adds its own vars.

**Logging (Pino):** JSON to stdout in prod; `pino-pretty` dev-only (gated on `NODE_ENV !== "production"`, devDependency). Root logger + child logger pattern (`log.child({ component: "..." })`). Level from `LOG_LEVEL`.

**`/health`:** `{ status: "starting" }` literal for Phase 5. Status enum forward-compat: `'starting' | 'ready' | 'degraded' | 'codec_mismatch' | 'fatal'`. Headers: `Content-Type: application/json`, `Cache-Control: no-store`. Bind `0.0.0.0:${PORT}`. No `/` route. Unknown paths → 404 (Hono default).

**Entry & Lifecycle:** `src/index.ts` boots: env → zod parse → Pino root → Hono app → register `/health` → start `@hono/node-server` → log listening. `SIGTERM`/`SIGINT` → log → `server.close()` → `process.exit(0)`. No supervisor / child processes / watchdogs in Phase 5.

**Workspace Wiring:** Add `packages/stream` to root `workspaces`. Package name `@traskriver/stream`. Scripts: `dev`, `build` (`tsc`), `start` (`node dist/index.js`), `check` (`tsc --noEmit`). `turbo.json` `build.outputs` adds `packages/stream/dist/**`. No touching of `packages/relay`.

**Directory Layout:** `packages/stream/{package.json, tsconfig.json, README.md, .gitignore, src/{index.ts, config.ts, logger.ts, server.ts}}`.

### Claude's Discretion

- Exact `pino-pretty` formatter options (colorize, translateTime, ignore).
- Whether `server.ts` exposes `createApp()` factory or module-level `app` const.
- Internal file splits if src files grow awkward.
- README.md content and tone.

### Deferred Ideas (OUT OF SCOPE)

- Full `/health` payload (rtspConnected, codec, lastSegmentWrittenAgoMs, restartsLast1h, uptimeMs) — Phase 7.
- Ops-only binding for `/health` (Tailscale / `ops.*` host) — Phase 7/8.
- MediaMTX spawn/supervisor, backoff, stall watchdog, codec guard — Phase 6.
- RTSP/camera env vars — Phase 6.
- systemd, TLS, DNS, runtime dir on tmpfs — Phase 8.
- `packages/relay` deletion, shared-types purge, wrangler cleanup — Phase 7/9.
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                                                            | Research Support                                                                                                                                                                                                                                    |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| STRM-01 | A new `packages/stream` Node 22 package exists with ESM, zod-validated config, Pino structured logging, and a `/health` HTTP endpoint. | Standard Stack (Hono 4.12, @hono/node-server 1.19, pino 10.3, pino-pretty 13.1, zod 4.3, @types/node 25.6); Architecture Patterns §1–5 (boot sequence, Pino factory, zod fail-fast, Hono `/health`, graceful shutdown); tsconfig block in Pitfalls. |

</phase_requirements>

## Summary

This phase is a pure scaffolding task: create a new Node 22 ESM workspace package with four source files and two config files. Every stack choice is locked by CONTEXT.md — research exists only to pin versions, document exact import shapes, and surface the small set of real gotchas around `node --experimental-strip-types --watch` + `tsc` emit coexisting in one package.

The single non-obvious technical question is how to write import specifiers so that both Node's runtime type-stripper and `tsc`'s emit agree. Node 22 requires extensions on import specifiers (`import './x.ts'`); `tsc` with `rewriteRelativeImportExtensions: true` rewrites those to `./x.js` in emitted output. This is the officially documented path and resolves the dev/prod parity constraint cleanly.

**Primary recommendation:** Author source with `.ts` import specifiers; set `allowImportingTsExtensions: true`, `rewriteRelativeImportExtensions: true`, `verbatimModuleSyntax: true` in the package tsconfig; use `z.coerce.number()` for `PORT`; use `z.prettifyError()` for the fail-fast log line; keep the `@hono/node-server` `serve()` return value so `server.close()` is callable from signal handlers.

## Standard Stack

### Core

| Library             | Version    | Purpose                                         | Why Standard                                                                                                   |
| ------------------- | ---------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `hono`              | `^4.12.14` | HTTP framework                                  | Locked by CONTEXT; small, Web-Standards-based, first-class Node adapter.                                       |
| `@hono/node-server` | `^1.19.14` | Node adapter (`serve()`, returns `http.Server`) | Official Hono adapter for Node; exposes the bare `http.Server` so `server.close()` works from signal handlers. |
| `pino`              | `^10.3.1`  | Structured JSON logger                          | Locked by CONTEXT; canonical Node JSON logger; child-logger API designed for component tagging.                |
| `zod`               | `^4.3.6`   | Env schema + fail-fast validation               | Locked by CONTEXT; Zod 4 ships `z.prettifyError()` and performance improvements.                               |

### Supporting (devDependencies)

| Library       | Version           | Purpose                             | When to Use                                                                          |
| ------------- | ----------------- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| `pino-pretty` | `^13.1.3`         | Dev-only human-readable Pino output | Gated on `NODE_ENV !== "production"`. Must stay devDependency — never ships to prod. |
| `@types/node` | `^25.6.0`         | Node stdlib types                   | Required for `process`, `node:http`, signal handlers.                                |
| `typescript`  | Inherit repo root | `tsc` emit + `--noEmit` check       | Root repo already has a TS toolchain; verify version is ≥ 5.7 (see Pitfalls).        |

**Installation:**

```bash
bun add --filter=@traskriver/stream hono @hono/node-server pino zod
bun add --filter=@traskriver/stream --dev pino-pretty @types/node
```

**Version verification performed 2026-04-20 via `npm view`:**

- `hono` 4.12.14 (published 2026-04-15)
- `@hono/node-server` 1.19.14 (published 2026-04-17)
- `pino` 10.3.1
- `pino-pretty` 13.1.3
- `zod` 4.3.6
- `@types/node` 25.6.0

### Alternatives Considered

Locked by CONTEXT.md — no alternative evaluation in scope. Fastify, Elysia, `node:http`, `tsx`, `nodemon`, `bun-types` all explicitly rejected.

## Architecture Patterns

### Recommended Project Structure

```
packages/stream/
├── package.json
├── tsconfig.json
├── README.md
├── .gitignore          (dist/, node_modules/)
└── src/
    ├── index.ts        # boot sequence (env → log → app → serve → signals)
    ├── config.ts       # zod schema + parse(process.env)
    ├── logger.ts       # Pino root logger factory
    └── server.ts       # Hono app + /health route
```

### Pattern 1: `@hono/node-server` Minimal Boot + Graceful Shutdown

**What:** `serve()` returns a Node `http.Server`; keep the reference and call `server.close(cb)` from signal handlers. The `SIGTERM` path uses the error-aware callback; `SIGINT` can use a simpler variant.
**When to use:** Entry point (`src/index.ts`) after config + logger are built.
**Example (verified, hono.dev/docs/getting-started/nodejs):**

```ts
import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();
app.get('/', (c) => c.text('Hello Node.js!'));

const server = serve(app);

process.on('SIGINT', () => {
	server.close();
	process.exit(0);
});
process.on('SIGTERM', () => {
	server.close((err) => {
		if (err) {
			console.error(err);
			process.exit(1);
		}
		process.exit(0);
	});
});
```

**Port/hostname override (verified):**

```ts
serve({ fetch: app.fetch, port: 8080, hostname: '0.0.0.0' });
```

`serve()` supports both shapes: `serve(app)` or `serve({ fetch: app.fetch, port, hostname })`. Forward-compat note: Phase 6's MediaMTX teardown wraps the existing `server.close()` call — first stop MediaMTX, then close HTTP.

### Pattern 2: Pino Root Logger Factory + Dev Pretty-Print

**What:** Single factory that returns a configured root logger. `pino-pretty` is wired as an inline `transport` only when `NODE_ENV !== "production"`. Child loggers tag components.
**When to use:** `src/logger.ts`, called once at boot.
**Example (verified, github.com/pinojs/pino/blob/main/docs/pretty.md):**

```ts
import pino from 'pino';

export function createLogger(opts: { level: string; nodeEnv: string }) {
	const isDev = opts.nodeEnv !== 'production';
	return pino({
		level: opts.level,
		transport: isDev
			? {
					target: 'pino-pretty',
					options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' }
				}
			: undefined
	});
}
```

**Child logger usage (verified, docs/child-loggers.md):**

```ts
const log = rootLogger.child({ component: 'server' });
log.info({ port }, 'stream service listening');
```

### Pattern 3: zod Env Schema + Fail-Fast at Boot

**What:** Single `z.object({...})` at module load; `schema.parse(process.env)` inside a try/catch; on `ZodError`, print human-readable diagnostics via `z.prettifyError()` + exit before any server starts.
**When to use:** `src/config.ts`, imported first in `src/index.ts`.
**Example (zod 4, verified zod.dev/v4):**

```ts
import { z } from 'zod';

const ConfigSchema = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
	LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
	PORT: z.coerce.number().int().positive().default(8080)
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
	const result = ConfigSchema.safeParse(process.env);
	if (!result.success) {
		// Write to stderr BEFORE logger is constructed (LOG_LEVEL may be the failing var)
		process.stderr.write(`FATAL: invalid env:\n${z.prettifyError(result.error)}\n`);
		process.exit(1);
	}
	return result.data;
}
```

**Rationale for writing to stderr first:** the Pino logger needs `LOG_LEVEL` from the config to construct. If config parsing fails, no logger exists yet, so printing the zod diagnostic to stderr directly is the correct escape hatch. `process.exit(1)` fires before Hono instantiates.

### Pattern 4: Hono `/health` Route with Explicit Headers

**What:** `c.json()` sets `Content-Type: application/json` automatically; `c.header()` adds `Cache-Control: no-store`. Unknown paths yield Hono's default 404 (no custom `notFound` handler needed for Phase 5).
**When to use:** `src/server.ts`.
**Example (hono.dev/docs/api/hono, verified):**

```ts
import { Hono } from 'hono';

export type HealthStatus = 'starting' | 'ready' | 'degraded' | 'codec_mismatch' | 'fatal';

export function createApp() {
	const app = new Hono();
	app.get('/health', (c) => {
		c.header('Cache-Control', 'no-store');
		return c.json({ status: 'starting' satisfies HealthStatus });
	});
	return app;
}
```

Hono's default 404 response is `404 Not Found` plain-text body, which is acceptable for Phase 5 (CONTEXT: "Unknown paths → 404"). No `app.notFound(...)` override required.

### Pattern 5: Boot Sequence (`src/index.ts`)

```ts
import { serve } from '@hono/node-server';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { createApp } from './server.ts';

const config = loadConfig();
const log = createLogger({ level: config.LOG_LEVEL, nodeEnv: config.NODE_ENV });
const app = createApp();

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: '0.0.0.0' }, (info) =>
	log.info({ port: info.port }, 'stream service listening')
);

function shutdown(signal: NodeJS.Signals) {
	log.info({ signal }, 'shutdown signal received');
	server.close((err) => {
		if (err) {
			log.error({ err }, 'error closing server');
			process.exit(1);
		}
		process.exit(0);
	});
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

Note: import specifiers include `.ts` (required by Node's type-stripper); `tsc` rewrites to `.js` on emit (see Pitfall 1).

### Anti-Patterns to Avoid

- **Don't duplicate Bun patterns from `packages/relay`.** Relay uses `Bun.serve`, `Bun.spawnSync`, `Bun.which` — none work on Node.
- **Don't put `pino-pretty` in `dependencies`.** Gated dev-only; ship path must not drag it in.
- **Don't skip the `server` reference.** `serve(app)` without capturing the return drops your ability to `close()` cleanly.
- **Don't use `z.nativeEnum()`.** Deprecated in Zod 4; `z.enum([...])` handles the string-literal case directly.
- **Don't forward-declare Phase 6 env vars.** Adds vars that Phase 5 doesn't read → violates "one mode, one schema."

## Don't Hand-Roll

| Problem                      | Don't Build                                        | Use Instead                               | Why                                                                                        |
| ---------------------------- | -------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| HTTP routing / JSON response | `node:http` `createServer` with manual URL parsing | `hono` + `@hono/node-server`              | Locked by CONTEXT; typed `c.json/c.header`, default 404, future middleware surface.        |
| Structured logging           | `console.log(JSON.stringify(...))`                 | `pino`                                    | Child loggers, level filtering, serializers, async writes — Pino already solves this.      |
| Dev pretty output            | Custom stdout formatter                            | `pino-pretty` via `transport`             | Dev-only gating, colorize, timestamp translation already built.                            |
| Env parsing / type coercion  | Manual `process.env.PORT && Number(...)` branches  | `zod` + `z.coerce.number()`               | Single schema = single source of truth; `prettifyError()` gives readable fatal output.     |
| TS → JS for prod             | `bun build`, `esbuild`, `tsup`                     | `tsc --build`                             | Locked by CONTEXT; deterministic, zero extra deps, no bundler shims, `node --check` clean. |
| TS → JS for dev              | `tsx`, `ts-node`, `nodemon`                        | `node --experimental-strip-types --watch` | Locked by CONTEXT; stdlib since Node 22.6, built-in file-watch restart.                    |

## Common Pitfalls

### Pitfall 1: Import Specifier Mismatch Between Dev (Node strip-types) and Prod (tsc emit)

**What goes wrong:** Node 22 `--experimental-strip-types` requires explicit extensions in import specifiers (`import './config.ts'`). `tsc` by default refuses to emit when it sees `.ts` specifiers (or rewrites nothing, leaving broken `.ts` refs in `dist/*.js`). Writing `.js` specifiers works for tsc but Node strip-types won't resolve them against `.ts` source.
**Why it happens:** Node's type-stripper is a lightweight runtime feature; TypeScript's emit is a separate world. They only agree when `tsc` is configured to rewrite `.ts` → `.js` on emit.
**How to avoid:** In `packages/stream/tsconfig.json`, set:

```jsonc
{
	"compilerOptions": {
		"allowImportingTsExtensions": true,
		"rewriteRelativeImportExtensions": true,
		"verbatimModuleSyntax": true
		// plus the CONTEXT-locked overrides (module/moduleResolution nodenext, outDir, rootDir, lib, types, etc.)
	}
}
```

Source imports use `.ts` (`import './config.ts'`). `tsc` emit rewrites to `.js`. `node --experimental-strip-types --watch src/index.ts` resolves them natively. This is the exact recipe the Node 22 TypeScript docs prescribe.
**Warning signs:** `ERR_MODULE_NOT_FOUND` at dev startup (`.ts` not found → missing flags), or `ERR_MODULE_NOT_FOUND` at `node dist/index.js` (`.ts` specifiers leaked into emit → `rewriteRelativeImportExtensions` missing).

Sources: nodejs.org/docs/v22.14.0/api/typescript.html (HIGH); nodejs/loaders issue #214 (MEDIUM).

### Pitfall 2: Banned TypeScript Syntax Under `--experimental-strip-types`

**What goes wrong:** Using any syntax that requires runtime transformation throws `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` at dev boot.
**Why it happens:** Node's type-stripper only erases type annotations; it doesn't transform code.
**How to avoid:** Do not use in `packages/stream/src/**`:

- `enum` (use `const` objects with `as const` + string-literal union types)
- `namespace` / legacy `module` blocks
- Legacy decorators (TC39 decorators also not yet supported)
- Parameter properties in class constructors (`constructor(private x: T) {}`)
- `import = require(...)` / `export = ...`
- `.tsx` files (unsupported entirely)

Enforcement recommendation: add `"erasableSyntaxOnly": true` to the package tsconfig (TypeScript 5.8+) so `tsc --noEmit` flags these at `bun check` time — before they hit `node --watch`.
**Warning signs:** `SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript enum is not supported in strip-only mode`.

Sources: nodejs.org/docs/v22.14.0/api/typescript.html (HIGH); typescript.tv/best-practices/why-typescript-enums-are-dead (MEDIUM, verified against Node docs).

### Pitfall 3: `import type` Not Used for Type-Only Imports

**What goes wrong:** Node's stripper requires the `type` keyword to correctly erase type imports. Without it, Node treats the import as a value and throws at runtime when the target doesn't export a runtime binding.
**How to avoid:** Always use `import type { Foo } from './x.ts'` for type-only imports; use `import { fn, type FnArg } from './x.ts'` for mixed. `verbatimModuleSyntax: true` makes tsc enforce this.
**Warning signs:** `SyntaxError: The requested module './x.ts' does not provide an export named 'Foo'` at dev runtime.

### Pitfall 4: DOM / WebWorker Types Leaking Through `@types/node`

**What goes wrong:** Leaving `lib` unset in the package tsconfig inherits `ES2022` from the root — which doesn't include DOM, but the repo root has `"lib": ["ES2022"]` only (verified above), so DOM isn't the risk. The real risk is `@types/node` pulling in Web-platform globals (`fetch`, `Request`, `WebSocket`) that are fine at runtime but make it easy to accidentally write browser-shaped code. Roadmap success criterion #1 requires "no DOM/Workers types."
**How to avoid:** Per CONTEXT, set `"lib": ["ES2023"]` and `"types": ["node"]` in the package tsconfig. Do NOT add `"DOM"`, `"DOM.Iterable"`, `"WebWorker"`. Do NOT install `@types/bun`. Verify with `bun check` — any accidental `document.`/`window.` reference compiles clean only if DOM leaks.
**Warning signs:** `tsc --noEmit` passes despite a typo like `document.title = "..."`.

### Pitfall 5: `node --experimental-strip-types` Flag on Node 22.18+ Default

**What goes wrong:** Node 22.18+ enables strip-types by default; Node 22.17 and earlier require the explicit flag. If the dev host has < 22.18, omitting the flag breaks. If the dev host has ≥ 22.18, including the flag is harmless but noisy.
**How to avoid:** Keep the flag in the `dev` script for portability across 22.6–22.latest. `engines.node: ">=22"` is sufficient. Do not rely on default-enabled behavior.

Source: nodejs/node issue #59364 (MEDIUM) + nodejs.dev/en/learn/typescript/run-natively (HIGH).

### Pitfall 6: `z.coerce.*` Input Type Change in Zod 4

**What goes wrong:** Zod 4 widens `z.coerce.string()` input type from `string` to `unknown`. For `PORT` from `process.env` this is fine (env vars are `string | undefined`), but it means `.default(8080)` must match output type (`number`), not input type.
**How to avoid:** `z.coerce.number().default(8080)` — default is a number, matching output. Not a string `"8080"`. Zod 4 short-circuits defaults on `undefined` input before coercion.

Source: zod.dev/v4/changelog (HIGH).

### Pitfall 7: `tsc` Emit Must Survive `node --check`

**What goes wrong:** Roadmap SC #2 requires `node --check dist/index.js` to pass. This parses the file without executing it; missing extensions, unresolved type-only imports leaking as values, or bad ESM syntax all fail here.
**How to avoid:** After `tsc`, run `node --check dist/index.js` as part of the build verification step. Don't rely solely on `tsc --noEmit` — it won't catch ESM specifier issues in the emitted output.

### Pitfall 8: Turbo `build.outputs` Must List `packages/stream/dist/**`

**What goes wrong:** Current `turbo.json` `build.outputs` lists `["dist/**", ".svelte-kit/cloudflare/**"]`. Turbo treats these as workspace-relative glob patterns. `dist/**` under a new `packages/stream` package works out of the box since turbo runs per-package and `outputs` paths are relative to each package's root.
**Verification:** The existing entry `"dist/**"` already covers `packages/stream/dist/**` automatically — no edit required. Confirm by inspecting whether turbo treats outputs as package-relative (it does, per turbo docs). If caching misbehaves, add `packages/stream/dist/**` explicitly as a belt-and-suspenders move.

Source: turbo.build/schema.json (HIGH for schema), behavioral verification deferred to planning/execution.

## Code Examples

### `packages/stream/package.json` (verified shape)

```json
{
	"name": "@traskriver/stream",
	"version": "0.0.0",
	"private": true,
	"type": "module",
	"engines": { "node": ">=22" },
	"main": "dist/index.js",
	"scripts": {
		"dev": "node --experimental-strip-types --watch src/index.ts",
		"build": "tsc",
		"start": "node dist/index.js",
		"check": "tsc --noEmit"
	},
	"dependencies": {
		"hono": "^4.12.14",
		"@hono/node-server": "^1.19.14",
		"pino": "^10.3.1",
		"zod": "^4.3.6"
	},
	"devDependencies": {
		"pino-pretty": "^13.1.3",
		"@types/node": "^25.6.0",
		"typescript": "^5.8.0"
	}
}
```

### `packages/stream/tsconfig.json` (verified shape)

```jsonc
{
	"extends": "../../tsconfig.json",
	"compilerOptions": {
		"lib": ["ES2023"],
		"types": ["node"],
		"module": "nodenext",
		"moduleResolution": "nodenext",
		"outDir": "./dist",
		"rootDir": "./src",
		"noEmit": false,
		"declaration": false,
		"sourceMap": true,
		"allowImportingTsExtensions": true,
		"rewriteRelativeImportExtensions": true,
		"verbatimModuleSyntax": true,
		"erasableSyntaxOnly": true
	},
	"include": ["src/**/*"]
}
```

The three `*Extensions` / `verbatimModuleSyntax` / `erasableSyntaxOnly` additions are outside CONTEXT's explicit override list but are MANDATORY for the locked dev/prod toolchain to work. Planner should note them as non-negotiable implementation details.

### Root `package.json` workspaces edit

Add `"packages/stream"` to the `workspaces` array. No new top-level scripts required — existing `turbo run build` and `turbo run check` fan out automatically.

### `turbo.json` edit

`build.outputs` already matches `dist/**` per-package. Optional explicit entry: `"packages/stream/dist/**"`. No `check` task change needed (it has no inputs/outputs declared).

## State of the Art

| Old Approach                                        | Current Approach                          | When Changed                      | Impact                                                                                           |
| --------------------------------------------------- | ----------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `tsx` / `ts-node` for dev                           | `node --experimental-strip-types --watch` | Node 22.6 (flag), 22.18 (default) | Zero-dep dev runner; 22.18+ removes the flag requirement, but keeping the flag is portable.      |
| Hand-rolled `node:http`                             | `hono` + `@hono/node-server`              | Hono 4.x matured 2024–2025        | Typed routing, middleware ecosystem, same Hono app works if Phase 6 ever wants to move off Node. |
| Zod 3 `z.nativeEnum()`                              | Zod 4 `z.enum(NativeEnum)`                | Zod 4.0 (2025)                    | `z.nativeEnum` deprecated; `z.enum([...strings])` remains the idiomatic string-literal path.     |
| Zod 3 `error.format()` / `error.issues` manual walk | `z.prettifyError(err)`                    | Zod 4.0                           | Single-call human-readable dump; ideal for fail-fast boot logs.                                  |
| `--watch` requires `nodemon`                        | Node `--watch` built-in                   | Node 18.11+ stable                | No extra dep.                                                                                    |

**Deprecated / outdated for this phase:**

- Anything that reads `tsconfig.json` at Node runtime (Node's type-stripper does not; it resolves specifiers itself).
- `z.nativeEnum()` — use `z.enum()`.

## Open Questions

1. **Does the current `turbo.json` `build.outputs: ["dist/**"]` glob pattern get treated as workspace-relative or package-relative by Turbo 2.5?\*\*
   - What we know: Turbo tasks run per-package and historically treat outputs as package-relative.
   - What's unclear: Whether the existing entry auto-covers the new `packages/stream/dist/**` without an explicit edit.
   - Recommendation: Planner adds `"packages/stream/dist/**"` explicitly alongside `"dist/**"` as a safety net; cost is zero.

2. **Does the root repo have TypeScript ≥ 5.8 available for `erasableSyntaxOnly`?**
   - What we know: Root `package.json` doesn't list TS in devDependencies; relay likely brings it in. 5.8 is required for `erasableSyntaxOnly`; 5.7 is required for `rewriteRelativeImportExtensions`.
   - Recommendation: Planner adds `"typescript": "^5.8.0"` to `packages/stream` devDependencies to guarantee the version regardless of what workspace hoisting picks.

3. **Should `server.ts` export `createApp()` or a module-level `app`?**
   - Marked Claude's Discretion. Recommendation: `createApp()` factory. Phase 6 may want to construct multiple apps in tests (supervisor state + HTTP surface); factory is cheap now and future-proof.

## Sources

### Primary (HIGH confidence)

- Context7 `/websites/hono_dev` — `serve()` signature, graceful shutdown, `notFound`, port override
- Context7 `/pinojs/pino` — child loggers, `pino-pretty` transport config
- Context7 `/websites/zod_dev_v4` — `z.coerce`, `.default()` semantics, `z.prettifyError`, `z.enum` vs `z.nativeEnum`
- nodejs.org/docs/v22.14.0/api/typescript.html — type-stripping constraints, required tsconfig, import specifier rules
- nodejs.dev/en/learn/typescript/run-natively — `--experimental-strip-types` / `--experimental-transform-types` semantics
- npm registry — version verification (`hono` 4.12.14, `@hono/node-server` 1.19.14, `pino` 10.3.1, `pino-pretty` 13.1.3, `zod` 4.3.6, `@types/node` 25.6.0; all checked 2026-04-20)

### Secondary (MEDIUM confidence)

- github.com/nodejs/loaders issue #214 — import specifier decision history (verified against Node docs)
- github.com/nodejs/node issue #59364 — Node 22.18 default-enable of strip-types (verified against Node docs)
- typescript.tv/best-practices/why-typescript-enums-are-dead — enum/erasable-syntax rationale (verified against Node docs)

### Tertiary (LOW confidence)

- None. All load-bearing claims verified against Context7 or official Node/Zod/Pino/Hono documentation.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all versions verified via `npm view` on 2026-04-20; all APIs verified via Context7.
- Architecture patterns: HIGH — boot sequence, logger factory, zod fail-fast, Hono `/health`, graceful shutdown each sourced from official docs.
- tsconfig / dev-runner pitfalls: HIGH — Node 22 TypeScript docs are explicit about required compilerOptions and banned syntax.
- Turbo outputs behavior: MEDIUM — inferred from Turbo schema + existing repo config; explicit entry recommended as safety net.

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30 days — stable stack, but Hono and Node release cadences are weekly; re-verify if Phase 5 is not executed by then).
