# @traskriver/stream

Node 22 ESM service that pulls RTSP from the Trask River camera and serves self-hosted HLS.

## Deployment

`reference/deploy-script.sh`, `reference/pull-stream.sh`, and `.env` are **reference only**. The live copies are maintained in the xCloud dashboard for the stream VPS and are not applied from this repo on deploy.

## Scripts

- `bun run dev` — `node --experimental-strip-types --watch src/index.ts`
- `bun run build` — `tsc` emit to `dist/`
- `bun run start` — `node dist/index.js`
- `bun run check` — `tsc --noEmit`

## Env

- `NODE_ENV` — `development | production | test` (default `production`)
- `LOG_LEVEL` — `trace | debug | info | warn | error | fatal` (default `info`)
- `PORT` — number (default `8080`)
