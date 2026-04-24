# @traskriver/stream

Node 22 ESM service that pulls RTSP from the Trask River camera and serves self-hosted HLS.

## Phase 5 status

Skeleton only — zod-validated config, Pino logger, Hono `/health` returning `{ status: "starting" }`. MediaMTX supervisor lands in Phase 6.

## Scripts

- `bun run dev` — `node --experimental-strip-types --watch src/index.ts`
- `bun run build` — `tsc` emit to `dist/`
- `bun run start` — `node dist/index.js`
- `bun run check` — `tsc --noEmit`

## Env

- `NODE_ENV` — `development | production | test` (default `production`)
- `LOG_LEVEL` — `trace | debug | info | warn | error | fatal` (default `info`)
- `PORT` — number (default `8080`)
