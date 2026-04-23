#!/usr/bin/env bash
set -euo pipefail

SITE_PATH="${XCLOUD_SITE_PATH:?XCLOUD_SITE_PATH is required}"
UNIT_NAME="stream"
BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
MEDIAMTX_VERSION="${MEDIAMTX_VERSION:-v1.17.1}"
MEDIAMTX_BIN="/var/www/stream.traskriver.com/bin/mediamtx"
ROUTE_SCRIPT_REL="scripts/configure-stream-ols-route.sh"
OLS_RELOAD_CMD="${OLS_RELOAD_CMD:-sudo -n systemctl reload lsws}"
OLS_RESTART_CMD="${OLS_RESTART_CMD:-sudo -n systemctl restart lsws}"

cd "$SITE_PATH"
export BUN_INSTALL PATH="$BUN_INSTALL/bin:$PATH"

mkdir -p /var/www/stream.traskriver.com/run/hls
mkdir -p /var/www/stream.traskriver.com/logs
mkdir -p "$(dirname "$MEDIAMTX_BIN")"

install_mediamtx() {
	local arch
	case "$(uname -m)" in
		x86_64) arch="amd64" ;;
		aarch64|arm64) arch="arm64v8" ;;
		*) echo "unsupported arch: $(uname -m)" >&2; exit 1 ;;
	esac
	local tarball="mediamtx_${MEDIAMTX_VERSION}_linux_${arch}.tar.gz"
	local url="https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_VERSION}/${tarball}"
	local tmp
	tmp="$(mktemp -d)"
	trap 'rm -rf "$tmp"' RETURN
	echo "Installing mediamtx ${MEDIAMTX_VERSION} (${arch})..."
	curl -fsSL "$url" -o "$tmp/${tarball}"
	tar -xzf "$tmp/${tarball}" -C "$tmp" mediamtx
	install -m 0755 "$tmp/mediamtx" "$MEDIAMTX_BIN"
}

current_mediamtx_version() {
	[ -x "$MEDIAMTX_BIN" ] || return 1
	"$MEDIAMTX_BIN" --version 2>/dev/null | head -n1 | awk '{print $NF}'
}

if [ "$(current_mediamtx_version || true)" != "$MEDIAMTX_VERSION" ]; then
	install_mediamtx
fi

cp /var/www/stream.traskriver.com/packages/stream/.env /var/www/stream.traskriver.com/.env

bun install --frozen-lockfile
bun run build:stream

if [ ! -x "${SITE_PATH}/${ROUTE_SCRIPT_REL}" ]; then
	echo "✗ Route provisioning script missing or not executable: ${SITE_PATH}/${ROUTE_SCRIPT_REL}" >&2
	exit 1
fi

echo "Applying OLS route config for /trask/* ..."
route_output="$("${SITE_PATH}/${ROUTE_SCRIPT_REL}" --apply)"
echo "$route_output"

if [[ "$route_output" == *"ROUTE_CONFIG_CHANGED=1"* ]]; then
	echo "Route config changed; reloading OpenLiteSpeed ..."
	if ! bash -lc "$OLS_RELOAD_CMD"; then
		echo "Reload failed, attempting OpenLiteSpeed restart ..."
		if ! bash -lc "$OLS_RESTART_CMD"; then
			echo "✗ OpenLiteSpeed reload and restart both failed." >&2
			exit 1
		fi
	fi
	echo "✓ OpenLiteSpeed route update applied."
else
	echo "OLS route already up-to-date; skipping reload."
fi

# Unit file lives at /etc/systemd/system/stream.service (managed manually, one-time root setup).
# Deploy only restarts the service; sudoers grants passwordless access to these specific commands.

# sudo -n systemctl restart "$UNIT_NAME"

# for i in $(seq 1 10); do
# 	if sudo -n systemctl is-active --quiet "$UNIT_NAME"; then
# 		echo "✓ ${UNIT_NAME} is active (attempt ${i})"
# 		exit 0
# 	fi
# 	sleep 1
# done

# echo "✗ ${UNIT_NAME} failed to start"
# sudo -n systemctl status "$UNIT_NAME" --no-pager || true
# exit 1