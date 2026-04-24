#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

SITE_DOMAIN="${SITE_DOMAIN:-stream.traskriver.com}"
UPSTREAM_BASE="${UPSTREAM_BASE:-http://127.0.0.1:8088}"
ROUTE_PREFIX="${ROUTE_PREFIX:-/trask/}"
MODE="apply"

BEGIN_MARKER="# BEGIN traskriver-managed-trask-route"
END_MARKER="# END traskriver-managed-trask-route"

for arg in "$@"; do
	case "$arg" in
		--check) MODE="check" ;;
		--apply) MODE="apply" ;;
		*)
			echo "Unknown argument: $arg" >&2
			echo "Usage: $0 [--check|--apply]" >&2
			exit 1
			;;
	esac
done

OLS_CONF_CANDIDATES=(
	"${OLS_VHOST_CONF:-}"
	"/home/xcloud/config/openlitespeed/conf/vhosts/${SITE_DOMAIN}/vhconf.conf"
	"/usr/local/lsws/conf/vhosts/${SITE_DOMAIN}/vhconf.conf"
)

choose_vhost_conf() {
	local candidate
	for candidate in "${OLS_CONF_CANDIDATES[@]}"; do
		[ -n "$candidate" ] || continue
		if [ -f "$candidate" ]; then
			printf '%s' "$candidate"
			return 0
		fi
	done
	return 1
}

VHOST_CONF="$(choose_vhost_conf || true)"
if [ -z "$VHOST_CONF" ]; then
	echo "Unable to locate OpenLiteSpeed vhost config for ${SITE_DOMAIN}." >&2
	echo "Checked:" >&2
	for candidate in "${OLS_CONF_CANDIDATES[@]}"; do
		[ -n "$candidate" ] && echo "  - $candidate" >&2
	done
	echo "Set OLS_VHOST_CONF to the correct path and retry." >&2
	exit 1
fi

if [ ! -r "$VHOST_CONF" ]; then
	echo "Vhost config is not readable: $VHOST_CONF" >&2
	exit 1
fi

if [ "$MODE" = "apply" ] && [ ! -w "$VHOST_CONF" ]; then
	echo "Vhost config is not writable: $VHOST_CONF" >&2
	exit 1
fi

tmp_stripped="$(mktemp)"
tmp_new="$(mktemp)"
cleanup() {
	rm -f "$tmp_stripped" "$tmp_new"
}
trap cleanup EXIT

awk -v begin="$BEGIN_MARKER" -v end="$END_MARKER" '
	$0 == begin { skip=1; next }
	$0 == end { skip=0; next }
	!skip { print }
' "$VHOST_CONF" > "$tmp_stripped"

cat > "$tmp_new" <<EOF
$(cat "$tmp_stripped")

${BEGIN_MARKER}
context ${ROUTE_PREFIX} {
  type                    proxy
  handler                 ${UPSTREAM_BASE}${ROUTE_PREFIX}
  websocket               0
  addRequestHeaders       X-Forwarded-Proto=https
  addRequestHeaders       X-Forwarded-Host=${SITE_DOMAIN}
  addRequestHeaders       X-Forwarded-Port=443
  addRequestHeaders       X-Forwarded-For=\${REMOTE_ADDR}
  addRequestHeaders       Host=${SITE_DOMAIN}
}
${END_MARKER}
EOF

if cmp -s "$VHOST_CONF" "$tmp_new"; then
	if [ "$MODE" = "check" ]; then
		echo "Route config up-to-date: $VHOST_CONF"
	fi
	echo "ROUTE_CONFIG_CHANGED=0"
	exit 0
fi

if [ "$MODE" = "check" ]; then
	echo "Route config drift detected in $VHOST_CONF" >&2
	echo "Run: ${REPO_ROOT}/scripts/configure-stream-ols-route.sh --apply" >&2
	exit 1
fi

cp "$tmp_new" "$VHOST_CONF"
echo "Updated OLS route config in $VHOST_CONF"
echo "ROUTE_CONFIG_CHANGED=1"
