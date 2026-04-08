# Monorepo Research: Bun Workspaces for river-stream

> Two packages: SvelteKit web app (`packages/web`) + TypeScript relay service (`packages/relay`)
> Runtime/package manager: Bun 1.3.9

---

## 1. Recommendation: Bun Workspaces Only (No Turborepo)

**Use Bun workspaces without Turborepo.** Here's why:

### Why not Turborepo

- **Two packages.** Turbo's value is task orchestration and caching across many packages. With two packages that have no shared build dependencies (`web` doesn't depend on `relay` or vice-versa), Turbo adds config overhead for zero graph-based benefit.
- **No shared build chain.** The relay is a standalone Bun/TS process. The web app builds via Vite/SvelteKit. There's no `dependsOn: ["^build"]` relationship to model.
- **Caching is marginal.** SvelteKit builds are fast already (~2-4s). The relay has no build step (Bun runs TS directly). Turbo's remote/local caching doesn't save meaningful time here.
- **Extra dependency.** Turbo is ~20MB+, requires `turbo.json` config, `packageManager` field, env variable declarations in `turbo.json` for cache correctness, and `.turbo` in `.gitignore`. All unnecessary friction for this project size.
- **Bun already handles it.** Bun workspaces natively support: `--filter` for running scripts in specific packages, `workspace:*` protocol for cross-references, dependency hoisting, parallel script execution with `--parallel`, and dependency-order-aware execution.

### What you lose without Turborepo

- **Build caching** — not meaningful with 2 small packages
- **Remote caching** — no CI to benefit from it (no `.github/` workflows found)
- **`turbo.json` task graph** — no inter-package build dependencies to model
- **Environment variable validation** — Turbo's strict mode catches missing env vars in cache keys, but this project deploys to Cloudflare where env vars are in `wrangler.jsonc` bindings

### When to reconsider

Add Turborepo later if: you add 4+ packages, introduce shared build dependencies between packages, or set up CI with multiple parallel build/test/lint tasks that benefit from caching.

---

## 2. Root package.json Structure

```json
{
	"name": "river-stream",
	"private": true,
	"workspaces": ["packages/web", "packages/relay", "packages/*"],
	"scripts": {
		"dev": "bun --filter '*' dev",
		"dev:web": "bun --filter web dev",
		"dev:relay": "bun --filter relay dev",
		"build": "bun --filter '*' build",
		"build:web": "bun --filter web build",
		"check": "bun --filter '*' check",
		"format": "prettier --write .",
		"lint": "prettier --check ."
	},
	"devDependencies": {
		"prettier": "^3.8.1",
		"prettier-plugin-svelte": "^3.4.1",
		"prettier-plugin-tailwindcss": "^0.7.2",
		"typescript": "^5.9.3"
	}
}
```

Key points:

- `"workspaces": ["packages/web", "packages/relay", "packages/*"]` — explicitly lists `web` and `relay`, plus a `packages/*` glob for future shared packages
- Shared dev tooling (prettier, typescript) lives at root
- Per-package tooling (svelte, wrangler, etc.) lives in each package's `package.json`
- `bun --filter` routes scripts to the right workspace
- No `packageManager` field needed (no Turborepo to satisfy)

---

## 3. Migration: Moving SvelteKit from Root to packages/web

### Strategy: `git mv` (preserves history with `git log --follow`)

This is the standard, cleanest approach. Git tracks content, not files — `git log --follow <file>` will trace renames.

### Step-by-step

```
# 1. Create the web directory
mkdir web

# 2. Move SvelteKit app files into /web using git mv
git mv src/ packages/web/src/
git mv static/ packages/web/static/
git mv svelte.config.js packages/web/
git mv vite.config.ts packages/web/
git mv tsconfig.json packages/web/
git mv wrangler.jsonc packages/web/
git mv worker-configuration.d.ts packages/web/
git mv components.json packages/web/
git mv .prettierrc packages/web/       # if web-specific; otherwise keep at root
git mv .prettierignore packages/web/   # same
git mv scripts/ packages/web/scripts/

# 3. Move the current package.json to packages/web/ and edit it
git mv package.json packages/web/package.json
# Then edit packages/web/package.json:
#   - Change "name" to "web" (or "@river-stream/web")
#   - Remove any root-only scripts
#   - Keep all SvelteKit/Cloudflare deps

# 4. Create new root package.json (see section 2 above)

# 5. Move lock file handling
# Keep bun.lock at root — Bun workspaces use a single root lockfile

# 6. Update .gitignore
# Change `/.svelte-kit` to `/packages/web/.svelte-kit`
# Change `/build` to `/packages/web/build`
# Change `/worker-configuration.d.ts` to `/packages/web/worker-configuration.d.ts`
# Change `/static/stream/*` to `/packages/web/static/stream/*`
# Add `.turbo` if ever using Turbo later

# 7. Run bun install from root to re-link workspaces
bun install

# 8. Commit
git add -A
git commit -m "chore: move SvelteKit app to /packages/web, set up Bun workspaces"
```

### Things that need updating after the move

#### wrangler.jsonc (now at `/packages/web/wrangler.jsonc`)

No path changes needed inside the file — `main` and `assets.directory` are already relative to the wrangler config location:

```jsonc
{
	"main": ".svelte-kit/cloudflare/_worker.js", // still correct (relative to web/)
	"assets": { "directory": ".svelte-kit/cloudflare" } // still correct
}
```

But: **run `wrangler` commands from `/packages/web`**, or use `bun --filter web` to route them. The `$schema` path needs updating:

```jsonc
"$schema": "./node_modules/wrangler/config-schema.json"
```

This will still resolve correctly because `wrangler` will be in `packages/web/node_modules` (or hoisted to root `node_modules` — either way, Bun's resolution handles it). If wrangler is hoisted, change to:

```jsonc
"$schema": "../node_modules/wrangler/config-schema.json"
```

#### tsconfig.json (now at `/packages/web/tsconfig.json`)

The `extends` path is relative and still correct:

```json
{ "extends": "./.svelte-kit/tsconfig.json" }
```

#### package.json scripts

All scripts use relative commands (`vite dev`, `svelte-kit sync`, etc.) so they work unchanged when run from `/packages/web`. The `preview` script references `.svelte-kit/cloudflare/_worker.js` which is relative — still correct.

#### Import paths

All `$lib/` and `$app/` imports are SvelteKit aliases resolved by Vite — unaffected by the directory move.

#### .env files

Move `.env` and `.env.example` to `/packages/web/` since they contain web-app-specific secrets (Cloudflare bindings, Stripe keys, etc.). The relay will have its own `.env`.

#### Cloudflare deployment

If deploying via `wrangler deploy` manually, run it from `/packages/web`:

```bash
bun --filter web deploy
# or: cd web && bunx wrangler deploy
```

If using Cloudflare Pages/Workers CI (dashboard-triggered), update the **build command** and **root directory** in the Cloudflare dashboard to point to `packages/web/`.

---

## 4. Gotchas: Bun + SvelteKit + Cloudflare Workers

### Bun workspace hoisting

Bun hoists dependencies to the root `node_modules` by default. This is usually fine, but:

- **wrangler** needs to be findable from the `packages/web/` directory. Hoisting handles this (it'll be at `root/node_modules/wrangler`).
- If a dependency **must** be in the package's own `node_modules`, you can't easily prevent hoisting in Bun (no `nohoist` equivalent). This hasn't been an issue with SvelteKit or wrangler in practice.

### Single lockfile

Bun workspaces use a single `bun.lock` at the repo root. Don't put lockfiles in sub-packages.

### .svelte-kit directory

The `.svelte-kit` directory is generated relative to where `svelte.config.js` lives. After moving to `/packages/web`, it will be at `/packages/web/.svelte-kit`. Update `.gitignore` accordingly.

### Cloudflare Workers deployment path

If using **Cloudflare dashboard** (connected Git repo):

- Set **Root Directory** to `web` in the Workers/Pages project settings
- Build command: `bun run build` (will run in the `packages/web/` context)
- Build output: `.svelte-kit/cloudflare` (relative to root directory setting)

If using **`wrangler deploy`** directly:

- Run from `packages/web/`: `cd packages/web && bunx wrangler deploy`
- Or from root: `bun --filter web deploy` (add `"deploy": "wrangler deploy"` to `packages/web/package.json` scripts)

### Bun --filter respects dependency order

When running `bun --filter '*' build`, Bun will build packages in dependency order. If `web` depends on `@river-stream/shared`, Bun will wait for `shared` to complete first (though with JIT packages there's no build step for shared, so this is a no-op).

### No .npmrc needed for workspaces

The current `.npmrc` has `engine-strict=true`. This is an npm/pnpm concept. Bun ignores `.npmrc` (it uses `bunfig.toml` for configuration). You can remove `.npmrc`.

---

## 5. Summary

| Decision      | Choice                             | Reason                                                  |
| ------------- | ---------------------------------- | ------------------------------------------------------- |
| Monorepo tool | Bun workspaces only                | 2 packages, no complex task graph, no CI                |
| Task runner   | `bun --filter`                     | Native, zero-config, respects dependency order          |
| Migration     | `git mv` to `/packages/web`        | Preserves history with `--follow`, minimal path changes |
| Shared types  | `packages/shared` with JIT pattern | No build step, `workspace:*` protocol, clean imports    |
| Lockfile      | Single root `bun.lock`             | Bun workspace standard                                  |
| Formatting    | Root-level prettier                | Shared across all packages                              |
