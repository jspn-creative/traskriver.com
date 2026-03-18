# Technology Stack

**Analysis Date:** 2026-03-18

## Languages

**Primary:**

- TypeScript 5.9.3 - Core application logic, routing (`src/routes/`), and Svelte components
- Svelte 5.51.0 - Component templating and reactivity (`src/**/*.svelte`)

**Secondary:**

- CSS - Styling using Tailwind directives (`src/routes/layout.css`)
- HTML - Base document structure (`src/app.html`)

## Runtime

**Environment:**

- Node.js (via Bun) - Local execution environment and script runner (`scripts/stream.ts`)
- Cloudflare Workers - Production target environment (`wrangler`)

**Package Manager:**

- Bun
- Lockfile: present (`bun.lock`)

## Frameworks

**Core:**

- SvelteKit 2.50.2 - Full-stack meta-framework for routing and API endpoints (`@sveltejs/adapter-cloudflare` 7.2.6)
- Tailwind CSS 4.1.18 - Utility-first styling framework (`@tailwindcss/vite`)

**Testing:**

- None detected

**Build/Dev:**

- Vite 7.3.1 - Application bundler and development server
- Wrangler 4.63.0 - Cloudflare CLI for local preview and deployment
- svelte-check 4.4.2 - Static analysis and type checking
- Prettier 3.8.1 - Code formatting

## Key Dependencies

**Critical:**

- `stripe` 20.4.1 - Manages subscriptions and payment sessions (`src/lib/server/stripe.ts`)
- `vidstack` 0.6.15 - Web components for the custom live video player (`src/lib/components/VideoPlayer.svelte`)

**Infrastructure:**

- `ffmpeg` - External dependency spawned by `scripts/stream.ts` to convert RTSP camera streams to HLS

## Configuration

**Environment:**

- Configured via local `.env` files and deployment provider environment variables
- Key configs required: `CAMERA_RTSP_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `COOKIE_SECRET`

**Build:**

- `svelte.config.js` - Svelte compiler and adapter configuration
- `vite.config.ts` - Vite bundler and plugin configuration
- `tsconfig.json` - TypeScript compiler options
- `wrangler.jsonc` - Cloudflare Workers deployment configuration

## Platform Requirements

**Development:**

- Bun runtime for package management and script execution
- `ffmpeg` installed locally for RTSP to HLS stream conversion

**Production:**

- Cloudflare Pages/Workers for deploying the web application
- An external/local environment to run the `scripts/stream.ts` ffmpeg process continuously

---

_Stack analysis: 2026-03-18_
