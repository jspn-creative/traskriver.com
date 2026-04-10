# Codebase Structure

**Analysis Date:** 2026-04-09

## Directory Layout

```
river-stream/
├── package.json              # Workspaces, root scripts (dev/build/check via turbo)
├── turbo.json                # Turbo task graph (build outputs, check)
├── scripts/
│   └── push-stream.ts        # Repo-level script (referenced from web package.json)
├── packages/
│   ├── shared/
│   │   ├── package.json      # @river-stream/shared — types + constants only
│   │   ├── index.ts          # Public exports (DemandResponse, RelayConfig, etc.)
│   │   └── tsconfig.json
│   ├── web/
│   │   ├── package.json      # @river-stream/web — SvelteKit + Vite + Wrangler
│   │   ├── svelte.config.js  # adapter-cloudflare, remoteFunctions, runes
│   │   ├── vite.config.ts    # Tailwind v4, sveltekit, SSR noExternal for UI libs
│   │   ├── tsconfig.json     # extends .svelte-kit/tsconfig.json, worker types
│   │   ├── wrangler.jsonc    # Worker name, KV binding, assets, compatibility
│   │   ├── worker-configuration.d.ts  # Wrangler-generated / augmented types
│   │   ├── scripts/
│   │   │   └── setup-signing.ts        # Local/dev helper for stream signing
│   │   ├── src/
│   │   │   ├── app.html
│   │   │   ├── app.css
│   │   │   ├── app.d.ts      # App.Platform.env (KV, RELAY_API_TOKEN, …)
│   │   │   ├── lib/
│   │   │   │   ├── index.ts  # Re-exports shared types for $lib consumers
│   │   │   │   ├── utils.ts
│   │   │   │   ├── assets/   # favicon, poster images
│   │   │   │   ├── components/  # Feature + ui (drawer primitives)
│   │   │   │   └── server/   # stripe.ts, subscription.ts (server-only)
│   │   │   └── routes/
│   │   │       ├── +layout.svelte
│   │   │       ├── +page.svelte
│   │   │       ├── +page.server.ts
│   │   │       ├── stream.remote.ts      # getStreamInfo query
│   │   │       ├── stream.copy.remote.ts # debug/alt stream remote
│   │   │       └── api/
│   │   │           ├── stream/demand/+server.ts
│   │   │           ├── relay/status/+server.ts
│   │   │           ├── stripe/checkout|success|webhook/+server.ts
│   │   │           └── test-access|test-kv/+server.ts
│   │   └── static/           # robots.txt, stream/.gitkeep
│   └── relay/
│       ├── package.json      # @river-stream/relay — Bun entry src/index.ts
│       ├── tsconfig.json
│       ├── scripts/          # setup.sh, boot-sync.sh, configure.ts
│       └── src/
│           ├── index.ts      # Main loop: poller, ffmpeg, state machine, reporter
│           ├── poller.ts
│           ├── status-reporter.ts
│           ├── ffmpeg.ts
│           ├── state-machine.ts
│           ├── health-server.ts
│           ├── logger.ts
│           └── state-machine.test.ts
└── .planning/codebase/       # GSD codebase maps (this folder)
```

## Directory Purposes

**`packages/web/src/routes/`:**
- Purpose: File-based routing; pages, layouts, and API endpoints.
- Contains: `+page.svelte`, `+layout.svelte`, `+page.server.ts`, `+server.ts` under `api/`, `*.remote.ts` for remote functions.
- Key files: `packages/web/src/routes/+page.svelte`, `packages/web/src/routes/stream.remote.ts`, `packages/web/src/routes/api/stream/demand/+server.ts`, `packages/web/src/routes/api/relay/status/+server.ts`

**`packages/web/src/lib/`:**
- Purpose: Shared UI and server-only modules imported via `$lib`.
- Contains: Svelte components, `components/ui/drawer/*`, `lib/server/*` for secrets and Stripe.
- Key files: `packages/web/src/lib/server/subscription.ts`, `packages/web/src/lib/server/stripe.ts`, `packages/web/src/lib/index.ts`

**`packages/shared/`:**
- Purpose: Cross-package TypeScript types and constants (no runtime server).
- Contains: `index.ts` only as public surface (`package.json` `exports`).
- Key files: `packages/shared/index.ts`

**`packages/relay/src/`:**
- Purpose: Standalone relay daemon (not bundled into web).
- Contains: Polling, ffmpeg management, HTTP status reporting to web API, optional health HTTP.
- Key files: `packages/relay/src/index.ts`, `packages/relay/src/poller.ts`, `packages/relay/src/status-reporter.ts`

**`scripts/` (repo root):**
- Purpose: Cross-package maintenance scripts invoked from workspace scripts.
- Contains: `scripts/push-stream.ts` (see root `package.json` / web `push-stream` script).

## Key File Locations

**Entry Points:**
- `packages/web/src/routes/+layout.svelte`: Root layout, global CSS import.
- `packages/web/src/routes/+page.svelte`: Main stream experience.
- `packages/relay/src/index.ts`: Relay process entry (`packages/relay/package.json` `main`).

**Configuration:**
- `package.json` (root): workspaces and turbo-driven scripts.
- `packages/web/svelte.config.js`: SvelteKit + Cloudflare adapter.
- `packages/web/vite.config.ts`: Vite plugins and SSR `noExternal`.
- `packages/web/wrangler.jsonc`: Deploy target for Worker + KV + assets.
- `turbo.json`: `build`/`check` pipeline.

**Core Logic:**
- `packages/web/src/routes/api/stream/demand/+server.ts`: Demand write (browser) and read (relay).
- `packages/web/src/routes/api/relay/status/+server.ts`: Status read (browser) and write (relay).
- `packages/web/src/routes/stream.remote.ts`: Signed HLS URL for Cloudflare Stream.
- `packages/relay/src/index.ts`: Orchestrates relay behavior.

**Testing:**
- `packages/relay/src/state-machine.test.ts`: Only test file observed in application packages (relay package).

## Naming Conventions

**Files:**
- Routes: `+page.svelte`, `+layout.svelte`, `+page.server.ts`, `+server.ts` (SvelteKit conventions).
- Remote functions: `*.remote.ts` beside the route that imports them (e.g. `packages/web/src/routes/stream.remote.ts`).
- Components: PascalCase `.svelte` under `packages/web/src/lib/components/` (e.g. `VideoPlayer.svelte`).
- UI primitives: kebab-case filenames under `packages/web/src/lib/components/ui/drawer/` (e.g. `drawer-content.svelte`).

**Directories:**
- `packages/<name>/` for workspace packages; `src/` for source; `api/<segment>/+server.ts` for HTTP handlers.

**Imports:**
- `$lib/...` for `packages/web/src/lib/...` (SvelteKit alias).
- `@river-stream/shared` for shared types/constants.

## Where to Add New Code

**New Feature (UI on home stream page):**
- Primary code: `packages/web/src/routes/+page.svelte` or new route folder under `packages/web/src/routes/`.
- Shared UI: `packages/web/src/lib/components/`.

**New API route:**
- Implementation: `packages/web/src/routes/api/<name>/+server.ts`.
- Shared types: extend `packages/shared/index.ts` if relay or client must share the shape.

**New server-only helper (web):**
- Implementation: `packages/web/src/lib/server/<topic>.ts`.
- Consume from: `+page.server.ts`, `+server.ts`, or `*.remote.ts` — not from client-only `.svelte` files unless exposed via remote/load.

**New remote function:**
- Implementation: add or extend `packages/web/src/routes/<route>.remote.ts` (same folder as the page that calls it).
- Use `query` / `getRequestEvent` from `$app/server` per `packages/web/src/routes/stream.remote.ts`.

**Relay behavior change:**
- Implementation: `packages/relay/src/` (prefer new module file if large); wire in `packages/relay/src/index.ts`.
- Shared config/types: `packages/shared/index.ts` (`RelayConfig` and related).

**Utilities:**
- Web-only helpers: `packages/web/src/lib/utils.ts` or new file under `packages/web/src/lib/`.
- Cross-runtime types/constants: `packages/shared/index.ts`.

## Special Directories

**`.svelte-kit/`:**
- Purpose: Generated SvelteKit output (types, adapter build).
- Generated: Yes.
- Committed: No (build artifact).

**`packages/web/static/`:**
- Purpose: Static files served as-is.
- Generated: No.
- Committed: Yes.

**`packages/relay/dist/`:**
- Purpose: Bun build output when running `packages/relay` `build`.
- Generated: Yes.
- Committed: Typically no (verify `.gitignore`).

---

*Structure analysis: 2026-04-09*
