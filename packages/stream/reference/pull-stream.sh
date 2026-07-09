# cd "$XCLOUD_SITE_PATH"
# # Pull repository
# git reset --hard && git clean -df
# git fetch origin "$XCLOUD_SITE_BRANCH"
# git checkout "origin/$XCLOUD_SITE_BRANCH" -f
# git pull origin "$XCLOUD_SITE_BRANCH"

# # Install Bun
# curl -fsSL https://bun.sh/install | bash
# export BUN_INSTALL="$HOME/.bun"
# export PATH="$BUN_INSTALL/bin:$PATH"

#!/usr/bin/env bash
set -euo pipefail

cd "$XCLOUD_SITE_PATH"

# Bun (install once)
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
fi
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

# Sync branch to remote exactly
git fetch --prune origin "$XCLOUD_SITE_BRANCH"
git checkout -B "$XCLOUD_SITE_BRANCH" "origin/$XCLOUD_SITE_BRANCH"
git reset --hard "origin/$XCLOUD_SITE_BRANCH"
git clean -df