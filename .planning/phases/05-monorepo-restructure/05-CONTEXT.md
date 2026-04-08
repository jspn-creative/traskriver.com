# Phase 05: Monorepo Restructure - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Move the existing SvelteKit + Cloudflare Workers codebase into a monorepo structure with three workspace packages: `packages/web` (SvelteKit app), `packages/relay` (TypeScript relay service), and shared types (`packages/shared`). The web app must remain functionally identical — dev server and Cloudflare Workers deployment must work from their new locations.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation choices are at Claude's discretion — pure infrastructure phase.

</decisions>

<code_context>

## Existing Code Insights

### Reusable Assets

- Existing SvelteKit app: `src/`, `scripts/`, `static/` — all move intact to `/web`
- Existing push-stream script: `scripts/push-stream.ts` — currently Node/Bun script, will move to `packages/relay`
- Package.json scripts: `bun dev`, `bun run stream` — these become the workspace scripts

### Established Patterns

- Bun workspaces — MONO-03 success criterion requires `bun dev` to run both dev server and relay
- Cloudflare Workers deploy: `wrangler deploy` from `packages/web` context — current deploy paths need updating
- TypeScript everywhere — relay service is TypeScript via Bun, no transpilation step needed

### Integration Points

- Root `package.json` will define workspaces: `["web", "relay", "shared"]`
- `packages/web` already has `bun.lock` and `package.json` — existing
- `packages/relay` is new — needs its own `package.json` with Bun as runtime
- `packages/shared` is new — needs `package.json` with only TypeScript types
- Root-level dev script `bun dev` needs to start both workspaces concurrently

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
