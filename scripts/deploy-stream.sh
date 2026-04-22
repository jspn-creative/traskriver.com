#!/usr/bin/env bash
set -euo pipefail

cd "${XCLOUD_SITE_PATH:?XCLOUD_SITE_PATH is required}"

export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

mkdir -p /var/www/stream.traskriver.com/run/hls
mkdir -p /var/www/stream.traskriver.com/logs

bun install --frozen-lockfile
bun run build:stream

pkill -f "/var/www/stream.traskriver.com/packages/stream/dist/index.js" || true
if command -v setsid >/dev/null 2>&1; then
	setsid -f bun run start:stream > /var/www/stream.traskriver.com/logs/stream.log 2>&1 < /dev/null
else
	nohup bun run start:stream > /var/www/stream.traskriver.com/logs/stream.log 2>&1 < /dev/null &
fi
