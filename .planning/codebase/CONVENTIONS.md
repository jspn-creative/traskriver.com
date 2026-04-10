# Coding Conventions

**Analysis Date:** 2026-04-09

## Naming Patterns

**Files:**

- Svelte components: PascalCase, e.g. `PassDetailsPanel.svelte`, `VideoPlayer.svelte` — location: `packages/web/src/lib/components/`
- Co-located route logic: `+page.svelte`, `+page.server.ts`, `+server.ts` under `packages/web/src/routes/`
- SvelteKit remote functions: `*.remote.ts` next to routes, e.g. `packages/web/src/routes/stream.remote.ts`
- Shared TypeScript: `packages/shared/` at package root (`index.ts`, types alongside)
- Relay Bun entry and modules: `packages/relay/src/*.ts`; tests: `*.test.ts` beside source (e.g. `packages/relay/src/state-machine.test.ts`)

**Functions:**

- camelCase for functions and methods (`getStreamInfo`, `transition`, `generateStreamToken`)
- Server handlers export named HTTP verbs (`GET`, `POST`) in `+server.ts` files

**Variables:**

- camelCase for locals and reactive state (`demandRegistered`, `relayStale`)
- SCREAMING_SNAKE for module-level constants (`POLL_INTERVAL_MS`, `DEMAND_KEY`, `THROTTLE_MS`)

**Types:**

- PascalCase for interfaces and exported types (`DemandResponse`, `TransitionEvent`, `StreamInfo`)
- String-literal unions for phases and states inline or in shared package (`RelayInternalState` in `@river-stream/shared`)

## Code Style

**Formatting:**

- Tool: Prettier (`prettier` ^3.8.1) with Svelte and Tailwind plugins
- Config: `packages/web/.prettierrc` — tabs, single quotes, `trailingComma: "none"`, `printWidth: 100`
- Tailwind class order: `prettier-plugin-tailwindcss` with `tailwindStylesheet` pointing to `packages/web/src/app.css`
- Ignore patterns: `packages/web/.prettierignore`

**Linting:**

- No ESLint in repo `package.json` files — **quality gate is Prettier check**, not ESLint
- Root `bun lint` runs `prettier --check` in `packages/web` only (`packages/web/package.json` `lint` script)

**Type checking:**

- `bun check` at root runs Turbo `check` across workspaces (`turbo.json`)
- Web: `svelte-kit sync` + `svelte-check` (`packages/web/package.json`)
- Relay/shared: `tsc --noEmit` with strict base config `tsconfig.json` at repo root

## Import Organization

**Order (typical in Svelte routes and components):**

1. Svelte / framework (`svelte/transition`, `@sveltejs/kit` helpers)
2. Type-only imports (`import type { ... }`)
3. Workspace package (`@river-stream/shared`)
4. `$lib/...` and `$app/...` / `$env/...` aliases
5. Relative imports (`./stream.remote`, sibling components)

**Path Aliases:**

- `$lib` → `packages/web/src/lib` (SvelteKit default)
- `$app/server`, `$env/dynamic/private` — SvelteKit virtual modules
- `@river-stream/shared` — workspace package (`packages/shared/package.json` `exports`)

**Example (actual pattern):** `packages/web/src/routes/+page.svelte` — transitions and easing, then `import type`, then `$lib/components/...`, then `./stream.remote`.

## Error Handling

**SvelteKit API routes (`packages/web/src/routes/api/**/+server.ts`):\*\*

- Use `throw error(status, message)` from `@sveltejs/kit` for HTTP errors (e.g. 401, 503)
- Success responses: `return json(payload)` with `satisfies` for response shapes where used
- Recoverable external failures: `try/catch` with `console.warn` and soft-degrade behavior (see `packages/web/src/routes/api/stream/demand/+server.ts` KV `put` failure)

**Relay (`packages/relay/`):**

- CLI-style failures: `process.exit(1)` after logging (e.g. `packages/relay/src/index.ts`)
- Invalid state transitions: log warning, return boolean `false` from `RelayStateMachine.transition` (`packages/relay/src/state-machine.ts`)

## Logging

**Framework:** `console` (`console.warn` in API routes; relay uses custom logger `packages/relay/src/logger.ts` re-exported/used in `state-machine.ts`)

**Patterns:**

- Prefix or structured tags in relay logs (`log.state`, `log.warn`) — see `packages/relay/src/logger.ts`
- Avoid throwing on best-effort paths when a degraded response is acceptable (demand KV write)

## Comments

**When to Comment:**

- Explain non-obvious business rules (throttle windows, free-tier KV limits) — see comments in `packages/web/src/routes/api/stream/demand/+server.ts`
- Section dividers in CSS theme files — `packages/web/src/app.css`

**JSDoc/TSDoc:**

- Sparse; prefer clear names and `satisfies` / explicit types on exports where needed

## Function Design

**Size:** No enforced max; prefer focused functions in `+server.ts` and remote modules.

**Parameters:** Destructuring for SvelteKit handlers (`async ({ platform })`, `async ({ request, platform })`).

**Return Values:**

- Project workspace guidance: avoid redundant explicit TypeScript return types on functions unless needed for clarity; async crypto helpers may use explicit return types (e.g. `generateStreamToken` in `packages/web/src/routes/stream.remote.ts`)

## Module Design

**Exports:**

- `+server.ts`: named exports `GET`, `POST`, etc.
- Shared types and constants: centralize in `packages/shared/` for web + relay

**Barrel Files:**

- Shared package single entry `packages/shared/index.ts` re-exporting public API

## Styling (UI)

**Tailwind CSS v4:** Configuration in CSS (`@import 'tailwindcss'`, `@theme`, `@custom-variant`) — primary file `packages/web/src/app.css`. Use utility classes in Svelte; Prettier sorts class strings via Tailwind plugin.

**Svelte 5:** Runes (`$state`, `$derived`, `$effect`, `$props`), `<script lang="ts">` — see `packages/web/src/lib/components/PassDetailsPanel.svelte`, `packages/web/src/routes/+page.svelte`.

---

_Convention analysis: 2026-04-09_
