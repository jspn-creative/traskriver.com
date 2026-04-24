#!/usr/bin/env bash
set -euo pipefail

LOCAL_STREAM_URL="${LOCAL_STREAM_URL:-http://127.0.0.1:8088/trask/index.m3u8}"
PUBLIC_STREAM_URL="${PUBLIC_STREAM_URL:-https://stream.traskriver.com/trask/index.m3u8}"
CURL_TIMEOUT_SECONDS="${CURL_TIMEOUT_SECONDS:-15}"

check_manifest() {
	local label="$1"
	local url="$2"
	local body_file
	body_file="$(mktemp)"
	trap 'rm -f "$body_file"' RETURN

	local http_code
	local curl_rc=0
	http_code="$(curl -sS --max-time "$CURL_TIMEOUT_SECONDS" --output "$body_file" --write-out '%{http_code}' "$url")" || curl_rc=$?

	if [ "$curl_rc" -ne 0 ]; then
		case "$curl_rc" in
			28)
				echo "✗ ${label}: timeout after ${CURL_TIMEOUT_SECONDS}s while fetching ${url}" >&2
				;;
			*)
				echo "✗ ${label}: curl failed (code ${curl_rc}) for ${url}" >&2
				;;
		esac
		return 1
	fi

	if [ "$http_code" != "200" ]; then
		case "$http_code" in
			404)
				echo "✗ ${label}: 404 from ${url} (route missing or path not proxied)." >&2
				;;
			502)
				echo "✗ ${label}: 502 from ${url} (proxy upstream unreachable)." >&2
				;;
			*)
				echo "✗ ${label}: HTTP ${http_code} from ${url}" >&2
				;;
		esac
		return 1
	fi

	local first_line=""
	IFS= read -r first_line < "$body_file" || true
	if [[ "$first_line" != "#EXTM3U"* ]]; then
		echo "✗ ${label}: HTTP 200 but response is not an HLS manifest (#EXTM3U missing)." >&2
		return 1
	fi

	echo "✓ ${label}: HTTP 200 with valid HLS manifest"
}

check_manifest "Local upstream" "$LOCAL_STREAM_URL"
check_manifest "Public HTTPS route" "$PUBLIC_STREAM_URL"
echo "✓ Route smoke checks passed."
