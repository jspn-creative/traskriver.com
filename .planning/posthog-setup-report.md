# PostHog post-wizard report

The wizard has completed a deep integration of PostHog into the Trask River Cam SvelteKit app. The following changes were made:

- **`src/hooks.client.ts`** (new) — Initializes PostHog on the client side via `posthog.init()` using the `/ingest` reverse proxy, with `capture_exceptions: true` for automatic error tracking. Also exports `handleError` to capture client-side exceptions.
- **`src/hooks.server.ts`** (new) — Sets up the `/ingest` reverse proxy route to forward PostHog requests server-side (avoids ad blockers). Exports `handleError` to capture server-side exceptions.
- **`src/lib/server/posthog.ts`** (new) — Per-request PostHog Node.js client factory (`createPostHogClient`) configured for Cloudflare Workers with `flushAt: 1` and `flushInterval: 0` for immediate event dispatch.
- **`svelte.config.js`** (modified) — Added `paths: { relative: false }` required for PostHog session replay to work correctly with SSR.
- **`src/routes/+page.svelte`** (modified) — Added client-side event captures for the full stream lifecycle.
- **`src/lib/components/VideoPlayer.svelte`** (modified) — Added `fullscreen_toggled` event capture.
- **`src/routes/api/stream/demand/+server.ts`** (modified) — Added server-side `stream_demand_registered` event on successful KV write.
- **`src/routes/api/relay/status/+server.ts`** (modified) — Added server-side `relay_status_updated` event when the relay reports a new state.

## Events

| Event                        | Description                                                           | File                                      |
| ---------------------------- | --------------------------------------------------------------------- | ----------------------------------------- |
| `stream_started`             | User clicks 'Start stream' and demand is successfully registered      | `src/routes/+page.svelte`                 |
| `stream_demand_failed`       | Demand registration API call fails (network error or non-ok response) | `src/routes/+page.svelte`                 |
| `stream_viewed`              | HLS stream begins playing — viewer enters active viewing phase        | `src/routes/+page.svelte`                 |
| `stream_ended`               | Stream transitions to ended state (relay stopped or stale)            | `src/routes/+page.svelte`                 |
| `stream_error`               | Stream hits timeout or unrecoverable error state                      | `src/routes/+page.svelte`                 |
| `stream_restarted`           | User clicks 'Watch again' or 'Try again' to restart the stream        | `src/routes/+page.svelte`                 |
| `playback_buffering_started` | Buffering begins during an active viewing session                     | `src/routes/+page.svelte`                 |
| `fullscreen_toggled`         | User enters or exits fullscreen mode on the video player              | `src/lib/components/VideoPlayer.svelte`   |
| `stream_demand_registered`   | Server successfully writes demand signal to KV store                  | `src/routes/api/stream/demand/+server.ts` |
| `relay_status_updated`       | Relay reports a new status (idle, starting, live, stopped) via POST   | `src/routes/api/relay/status/+server.ts`  |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- 📊 **Dashboard — Analytics basics**: https://us.posthog.com/project/377224/dashboard/1468102
- 🔽 **Stream start-to-view funnel**: https://us.posthog.com/project/377224/insights/eWeZ4JQQ
- 📈 **Daily stream starts**: https://us.posthog.com/project/377224/insights/y5pLkr8B
- ⚠️ **Stream errors vs starts**: https://us.posthog.com/project/377224/insights/gr6i581x
- 🔄 **Stream restart rate** (broken down by `from_phase`): https://us.posthog.com/project/377224/insights/Lb3kiogX
- 📡 **Buffering events per day**: https://us.posthog.com/project/377224/insights/0CGw5lcW
