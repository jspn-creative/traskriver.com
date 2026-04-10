# Architecture

**Analysis Date:** 2026-04-09

## Pattern Overview

**Overall:** Monorepo with three packages: a SvelteKit web app deployed as a Cloudflare Worker (static assets + request handler), a long-running Bun relay service at the edge of the network, and a shared TypeScript contract package.

**Key Characteristics:**

- **Split runtime:** Browser UI and HTTP API live in `packages/web`; ingest/transcode runs in `packages/relay` (Bun + `ffmpeg`).
- **Coordination via Cloudflare KV:** The Worker exposes authenticated APIs; relay and browser write/read demand and status through KV (`RIVER_KV` binding declared in `packages/web/src/app.d.ts`, configured in `packages/web/wrangler.jsonc`).
- **SvelteKit server features:** Route modules under `packages/web/src/routes/`; server-only logic in `+server.ts` and `*.remote.ts` files using SvelteKit remote functions (`query` from `$app/server`).

## Layers

**Presentation (Svelte 5 UI):**

- Purpose: Stream viewing UI, drawer/sidebar, telemetry.
- Location: `packages/web/src/routes/*.svelte`, `packages/web/src/lib/components/`
- Contains: Runes (`$state`, `$effect`, `$derived`), `svelte:boundary` + async `await` for remote data, Vidstack-based player (`VideoPlayer.svelte`).
- Depends on: Remote functions (`packages/web/src/routes/stream.remote.ts`), `fetch` to same-origin API routes, shared types from `@river-stream/shared`.
- Used by: End users in the browser.

**HTTP API (SvelteKit handlers on Cloudflare):**

- Purpose: KV-backed demand and relay status.
- Location: `packages/web/src/routes/api/**/+server.ts`
- Contains: `GET`/`POST` handlers; `platform.env` for KV and secrets; JSON responses via `@sveltejs/kit`.
- Depends on: `$env/dynamic/private` for Cloudflare Stream env.
- Used by: Browser (`fetch`), relay (`DemandPoller`, `StatusReporter` in `packages/relay/src/`).

**Server-only helpers (web):**

- Purpose: Optional shared server utilities under `packages/web/src/lib/server/` when needed; stream JWT signing is inlined in `stream.remote.ts`.
- Depends on: Web Crypto in the Worker runtime, env vars.
- Used by: `+server.ts`, `stream.remote.ts`.

**Remote functions (typed server calls from components):**

- Purpose: Type-safe server execution for stream manifest URL generation (JWT for Cloudflare Stream).
- Location: `packages/web/src/routes/stream.remote.ts` (active pattern); `packages/web/src/routes/stream.copy.remote.ts` (alternate/debug variant).
- Contains: `export const getStreamInfo = query(async () => { ... })`.
- Depends on: `$app/server` (`query`).
- Used by: `packages/web/src/routes/+page.svelte` via `await getStreamInfo()`.

**Relay service (Bun):**

- Purpose: Poll demand API; run `ffmpeg` against RTSP; report state to Worker; optional local health HTTP server.
- Location: `packages/relay/src/`
- Contains: `index.ts` orchestration; `poller.ts`, `status-reporter.ts`, `ffmpeg.ts`, `state-machine.ts`, `health-server.ts`, `logger.ts`.
- Depends on: `@river-stream/shared` (`RelayConfig`, payloads); env vars (`STREAM_URL`, `RTSP_URL`, `RELAY_BEARER_TOKEN`, URLs for demand/status APIs).
- Used by: Raspberry Pi deployed on-site. Not imported or used by web.

**Shared contract:**

- Purpose: Single source of truth for API shapes and relay configuration typing.
- Location: `packages/shared/index.ts`
- Contains: `DemandResponse`, `RelayState`, `RelayStatusPayload`, `RelayStatusResponse`, `RelayConfig`, TTL constants.
- Depends on: TypeScript only.
- Used by: `packages/web` (routes, components), `packages/relay`.

## Data Flow

**Demand → relay → stream:**

1. User triggers start; browser `POST`s `packages/web/src/routes/api/stream/demand/+server.ts`, which writes demand timestamp to KV (`DEMAND_KEY`).
2. Relay `DemandPoller` (`packages/relay/src/poller.ts`) `GET`s the demand endpoint with `Authorization: Bearer <RELAY_API_TOKEN>` (token matches Worker `platform.env.RELAY_API_TOKEN`).
3. When `shouldStream` is true, `packages/relay/src/index.ts` drives `RelayStateMachine`, starts `FfmpegManager` (`packages/relay/src/ffmpeg.ts`), and `StatusReporter` `POST`s to `packages/web/src/routes/api/relay/status/+server.ts` with JSON body matching `RelayStatusPayload` from `packages/shared/index.ts`.
4. Browser polls `GET` `packages/web/src/routes/api/relay/status/+server.ts` for `RelayStatusResponse` (stale if timestamp older than `RELAY_STATUS_STALE_THRESHOLD_MS` in shared).
5. When UI shows the player, `getStreamInfo` in `packages/web/src/routes/stream.remote.ts` signs a short-lived JWT (Web Crypto + env `CF_STREAM_*`) and returns `liveHlsUrl` for HLS playback.

**State management:**

- **Server:** KV keys for demand and relay status.
- **Client:** Local UI phase machine and polling timers in `packages/web/src/routes/+page.svelte` (`$state` / `$effect`); no global client store library detected.

## Key Abstractions

**`query` remote functions:**

- Purpose: Callable server functions with request context (cookies, env) without manual `load` wiring for that data.
- Examples: `packages/web/src/routes/stream.remote.ts`
- Pattern: `import { query } from '$app/server'` (SvelteKit experimental remote functions, enabled in `packages/web/svelte.config.js`).

**KV-backed APIs:**

- Purpose: Durable small payloads shared between Worker and relay without a traditional database.
- Examples: `packages/web/src/routes/api/stream/demand/+server.ts`, `packages/web/src/routes/api/relay/status/+server.ts`
- Pattern: `platform?.env?.RIVER_KV` with `get`/`put` and optional `expirationTtl` for relay status.

**Relay state machine:**

- Purpose: Enforce valid `RelayInternalState` transitions and notify `StatusReporter` on transitions.
- Examples: `packages/relay/src/state-machine.ts`, wired in `packages/relay/src/index.ts`
- Pattern: Explicit transition map + `onTransition` callbacks.

## Entry Points

**SvelteKit app (browser + SSR):**

- Location: `packages/web/src/routes/+layout.svelte`, `packages/web/src/routes/+page.svelte`, `packages/web/src/app.html`
- Triggers: HTTP requests to deployed Worker or Vite dev server.
- Responsibilities: Shell layout, main stream UI, composition of `$lib/components`.

**Cloudflare Worker bundle:**

- Location: Built output referenced by `packages/web/wrangler.jsonc` (`main`: `.svelte-kit/cloudflare/_worker.js`)
- Triggers: All dynamic routes and API routes; static assets from `.svelte-kit/cloudflare` via `assets` config.
- Responsibilities: SSR, API, KV access, env bindings.

**Relay process:**

- Location: `packages/relay/src/index.ts` (`bun run src/index.ts` per `packages/relay/package.json`)
- Triggers: Manual/systemd/Tailscale host start; `SIGTERM`/`SIGINT` for graceful shutdown.
- Responsibilities: Demand polling loop, ffmpeg lifecycle, status reporting, optional health endpoint (`packages/relay/src/health-server.ts`).

**Monorepo orchestration:**

- Location: `package.json` (root scripts `dev`, `build`, `check`), `turbo.json`
- Triggers: Developer/CI invoking `bun run` at repo root.
- Responsibilities: Workspace-wide `build`/`check` via Turbo pipeline.

## Error Handling

**Strategy:** HTTP status codes from SvelteKit (`error`, `json`); relay logs and continues polling where safe; KV `put` failures logged as soft failures in demand/status handlers.

**Patterns:**

- Missing `platform.env` or KV: `throw error(503, ...)` in API routes (e.g. `packages/web/src/routes/api/stream/demand/+server.ts`).
- Relay auth: `401` when `Authorization` bearer does not match `RELAY_API_TOKEN`.
- Remote query misconfiguration: `throw new Error(...)` in `getStreamInfo` surfaced through `svelte:boundary` `failed` snippet in `+page.svelte`.

## Cross-Cutting Concerns

**Logging:** `console` in Worker routes; structured-style logs in `packages/relay/src/logger.ts`.

**Validation:** Manual checks on JSON payloads and relay state strings in `packages/web/src/routes/api/relay/status/+server.ts`.

**Authentication:**

- Relay → Worker: shared bearer token (`RELAY_API_TOKEN`).
- End-user stream access: public (no paywall or account gate).

---

_Architecture analysis: 2026-04-09_
