# Technology Stack

**Analysis Date:** 2026-04-09

## Languages

**Primary:**

- TypeScript (strict, ES2022 target) — all application code in `packages/web`, `packages/relay`, and `packages/shared`; config in repo root `tsconfig.json` and per-package `tsconfig.json`.

**Secondary:**

- JavaScript — minimal; `packages/web/svelte.config.js` for SvelteKit config.

- Shell — operational scripts (e.g. `packages/relay/scripts/setup.sh`).

## Runtime

**Environment:**

- Bun — primary JS/TS runtime for monorepo scripts, relay service, and tooling (`packageManager`: `bun@1.3.9` in root `package.json`).

- Cloudflare Workers — production runtime for the web app via `@sveltejs/adapter-cloudflare` and Wrangler (`packages/web/wrangler.jsonc`).

**Package Manager:**

- Bun — lockfile: `bun.lock` at repo root.

## Frameworks

**Core:**

- SvelteKit `^2.50.2` — full-stack web framework (`packages/web`).

- Svelte `^5.51.0` — UI with runes (`packages/web`).

- Vite `^7.3.1` — dev server and bundler (`packages/web/vite.config.ts`).

**Testing:**

- Not detected as a dedicated runner in `package.json` scripts (no Vitest/Jest config in repo root or `packages/web`).

**Build/Dev:**

- Turbo `^2.5.4` — monorepo task orchestration (`turbo.json`: `build`, `check`).

- Wrangler `^4.63.0` — Cloudflare Workers deploy, preview, and generated types (`packages/web` scripts `deploy`, `preview`, `gen`).

- concurrently `^9.1.2` — run web + relay dev in parallel (`package.json` `dev:all`).

## Key Dependencies

**Critical:**

- `@sveltejs/adapter-cloudflare` — deploy SvelteKit to Workers (`packages/web/svelte.config.js`).

- `vidstack` `^0.6.15` — video player (`packages/web` components).

- `@tailwindcss/vite`, `tailwindcss` `^4.1.18` — styling pipeline (`packages/web/vite.config.ts`, `packages/web/src/app.css`).

- `bits-ui`, `vaul-svelte`, `@lucide/svelte` — UI primitives and icons (`packages/web`).

**Infrastructure:**

- Relay has no npm deps beyond TypeScript tooling; uses Bun stdlib, `ffmpeg` on PATH (`packages/relay/src/index.ts`, `packages/relay/src/ffmpeg.ts`).

- `@traskriver/shared` — workspace package for shared TypeScript types (`packages/shared/index.ts`).

## Configuration

**Environment:**

- SvelteKit: private env via `$env/dynamic/private` (`packages/web/src/routes/stream.remote.ts`).

- Workers platform bindings typed in `packages/web/src/app.d.ts` (`RIVER_KV`, `RELAY_API_TOKEN`, optional `DEMAND_WINDOW_SECONDS`).

- Relay: `process.env` in `packages/relay/src/index.ts` (documented vars: `STREAM_URL`, `RTSP_URL`, `DEMAND_API_URL`, `STATUS_API_URL`, `RELAY_BEARER_TOKEN`, polling/health tuning).

- Operator scripts: `process.env` in `scripts/push-stream.ts`, `packages/web/scripts/setup-signing.ts` (see `INTEGRATIONS.md`).

- Production relay: `.env` expected on deploy host per `packages/relay/scripts/configure.ts` (path `/opt/river-relay/.env` — do not commit secrets).

**Build:**

- Root: `tsconfig.json`, `turbo.json`, `package.json` workspaces.

- Web: `packages/web/vite.config.ts`, `packages/web/svelte.config.js`, `packages/web/wrangler.jsonc`, `packages/web/tsconfig.json`.

- Relay: `packages/relay/tsconfig.json`, `bun build` output to `dist/` per `packages/relay/package.json`.

- Formatting: `packages/web/.prettierrc`, `packages/web/.prettierignore` (Prettier 3 with Svelte + Tailwind plugins).

## Platform Requirements

**Development:**

- Bun for installs and scripts.

- `ffmpeg` on PATH for relay and `scripts/push-stream.ts`.

- Node types (`@types/node`) where referenced; dev uses Vite/SvelteKit.

**Production:**

- Web: Cloudflare Workers + KV namespace binding `RIVER_KV` (`packages/web/wrangler.jsonc`).

- Relay: long-running Bun process on edge device (systemd units under `packages/relay/config/`, deployed via `packages/relay/scripts/configure.ts`).

---

_Stack analysis: 2026-04-09_
