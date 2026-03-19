# Scripts

## `bun run push-stream`

Pushes an RTSP camera stream into Cloudflare Stream using `ffmpeg`. Temporary necessity until a dedicated device is deployed to push the stream.

### Requirements

- `ffmpeg` installed and available in your `PATH`

## `bun run setup-signing`

Creates a Cloudflare Stream signing key via the Cloudflare API and prints the values to put into your `.env`.

### When to use

Run this when you need to generate (or rotate) signing credentials used by the app to play/authorize Stream content.
