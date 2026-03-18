# Coding Conventions

**Analysis Date:** 2026-03-18

## Naming Patterns

**Files:**

- SvelteKit reserved files: `+page.svelte`, `+server.ts`, `+page.server.ts`
- Utility and service files: `camelCase.ts` (e.g., `src/lib/server/stripe.ts`, `src/lib/server/subscription.ts`)

**Functions:**

- `camelCase` for all functions.
- Defined as exported arrow functions (e.g., `export const getStripe = () => { ... }`).

**Variables:**

- `camelCase` for variables and constants.
- `SCREAMING_SNAKE_CASE` for environment variables when accessed directly (e.g., `process.env.CAMERA_RTSP_URL`).

**Types:**

- `PascalCase` for types and interfaces (inferred from TypeScript standards; minimal explicit types defined).

## Code Style

**Formatting:**

- Tool used: Prettier
- Key settings: `useTabs: true`, `singleQuote: true`, `trailingComma: "none"`, `printWidth: 100`
- Plugins: `prettier-plugin-svelte`, `prettier-plugin-tailwindcss`

**Linting:**

- Tool used: `svelte-check` and `tsc` for type-checking. No traditional linter (like ESLint) is present.
- Key rules: Strict mode is enabled in `tsconfig.json` (`"strict": true`).

## Import Organization

**Order:**

1. Built-in Node.js modules or framework externals (e.g., `import { dev } from '$app/environment'`, `import { error } from '@sveltejs/kit'`)
2. Third-party dependencies (e.g., `import Stripe from 'stripe'`)
3. Internal aliases and local paths (e.g., `import { getStripe } from '$lib/server/stripe'`)

**Path Aliases:**

- SvelteKit aliases used extensively: `$lib`, `$app`, `$env/dynamic/private`.
- Absolute imports are preferred over relative ones using aliases.

## Error Handling

**Patterns:**

- **Early returns:** Checks for invalid states first and returns or throws immediately.
- **SvelteKit Helpers:** Uses `throw error(status, message)` for API failures and `throw redirect(status, location)` for navigation.
- **Type Narrowing:** When catching unknown errors, uses `instanceof Error` to extract messages safely (e.g., `const message = issue instanceof Error ? issue.message : 'Invalid'; throw error(400, message);`).
- **Required Environment Checks:** Functions throw standard JavaScript `Error` objects during initialization if required config is missing.

## Logging

**Framework:** `console`

**Patterns:**

- Native `console.log()` used for routine event tracking (e.g., Stripe webhooks).
- Native `console.error()` used for fatal initialization errors (e.g., missing environment variables in scripts).

## Comments

**When to Comment:**

- Minimal. The codebase relies entirely on self-documenting, readable code. Comments are almost exclusively framework-generated defaults.

**JSDoc/TSDoc:**

- Not currently used.

## Function Design

**Size:** Small and focused. Functions typically perform a single responsibility (e.g., encoding, decoding, fetching a config).

**Parameters:**

- Destructuring used for Svelte component props: `let { data } = $props<{...}>();`
- SvelteKit endpoint destructuring: `export const POST = async ({ request, cookies }) => { ... }`

**Return Values:**

- Implicit returns widely used via arrow functions.
- **Void pattern:** Explicit use of the `void` operator for unawaited, ignored Promises (e.g., `void defineCustomElements();`, `void document.exitFullscreen();`). This is a key stylistic convention in Svelte components.

## Module Design

**Exports:**

- Named exports exclusively for constants and functions (`export const ...`). Default exports are only used implicitly by Svelte compiler for `.svelte` components.

**Barrel Files:**

- `src/lib/index.ts` exists but is currently empty. Direct imports to specific modules are preferred.

---

_Convention analysis: 2026-03-18_
