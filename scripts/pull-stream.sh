#!/usr/bin/env bash
set -euo pipefail

cd "${XCLOUD_SITE_PATH:?XCLOUD_SITE_PATH is required}"
: "${XCLOUD_SITE_BRANCH:?XCLOUD_SITE_BRANCH is required}"

if ! command -v bun >/dev/null 2>&1; then
	curl -fsSL https://bun.sh/install | bash
fi

export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

git fetch --prune origin "$XCLOUD_SITE_BRANCH"
git checkout -B "$XCLOUD_SITE_BRANCH" "origin/$XCLOUD_SITE_BRANCH"
git reset --hard "origin/$XCLOUD_SITE_BRANCH"
git clean -df
