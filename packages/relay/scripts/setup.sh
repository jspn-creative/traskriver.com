#!/usr/bin/env bash
set -euo pipefail

# One-time provisioning script for fresh Pi OS Lite.
# TODO: set to your actual repository URL before first use.
RELAY_DIR="/opt/river-relay"
RELAY_USER="relay"
REPO_URL="https://github.com/your-user/river-stream.git"

# --- Preflight ---
if [[ $EUID -ne 0 ]]; then
	echo "ERROR: setup.sh must be run as root (use sudo)"
	exit 1
fi

# --- 1) Locate and parse .env from boot partition ---
ENV_SRC=""
if [[ -f /boot/firmware/.env ]]; then
	ENV_SRC="/boot/firmware/.env"
elif [[ -f /boot/.env ]]; then
	ENV_SRC="/boot/.env"
fi

if [[ -z "$ENV_SRC" ]]; then
	echo "ERROR: No .env found on boot partition (/boot/firmware/.env or /boot/.env)"
	echo "Place .env on the FAT32 boot partition before running setup.sh"
	exit 1
fi

echo "Found .env at $ENV_SRC"

# Parse TAILSCALE_AUTHKEY without sourcing arbitrary shell content.
TAILSCALE_AUTHKEY="$(
	awk -F= '/^[[:space:]]*TAILSCALE_AUTHKEY[[:space:]]*=/{print substr($0, index($0,$2)); exit}' "$ENV_SRC" \
		| sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
)"

if [[ -z "${TAILSCALE_AUTHKEY:-}" || "$TAILSCALE_AUTHKEY" == "your-tailscale-auth-key" ]]; then
	echo "ERROR: TAILSCALE_AUTHKEY not found in .env"
	exit 1
fi

# --- 2) Base packages ---
echo "Updating package lists..."
apt-get update -qq

echo "Installing ffmpeg and prerequisites..."
apt-get install -y -qq ffmpeg curl git

# --- 3) Bun ---
if ! command -v bun &>/dev/null; then
	echo "Installing Bun..."
	curl -fsSL https://bun.sh/install | bash
	cp /root/.bun/bin/bun /usr/local/bin/bun
	chmod +x /usr/local/bin/bun
fi
echo "Bun: $(bun --version)"

# --- 4) Tailscale ---
if ! command -v tailscale &>/dev/null; then
	echo "Installing Tailscale..."
	curl -fsSL https://tailscale.com/install.sh | sh
fi

echo "Authenticating Tailscale and enabling exit node..."
tailscale up --authkey="$TAILSCALE_AUTHKEY" --advertise-exit-node --ssh

# --- 5) Relay user ---
if ! id "$RELAY_USER" &>/dev/null; then
	echo "Creating $RELAY_USER user..."
	useradd --system --shell /usr/sbin/nologin --home-dir "$RELAY_DIR" "$RELAY_USER"
fi

# --- 6) Clone repo (sparse checkout) ---
if [[ ! -d "$RELAY_DIR/.git" ]]; then
	echo "Cloning repository to $RELAY_DIR (sparse checkout: relay + shared)..."
	git clone --filter=blob:none --no-checkout "$REPO_URL" "$RELAY_DIR"
	cd "$RELAY_DIR"
	git sparse-checkout init --cone
	git sparse-checkout set packages/relay packages/shared
	git checkout main
fi
chown -R "$RELAY_USER:$RELAY_USER" "$RELAY_DIR"

# --- 7) Seed .env into relay directory ---
echo "Seeding .env to $RELAY_DIR/.env..."
cp "$ENV_SRC" "$RELAY_DIR/.env"
chmod 600 "$RELAY_DIR/.env"
chown "$RELAY_USER:$RELAY_USER" "$RELAY_DIR/.env"

# --- 8) SD card hardening ---
echo "Hardening SD card..."

dphys-swapfile swapoff 2>/dev/null || true
dphys-swapfile uninstall 2>/dev/null || true
systemctl disable dphys-swapfile 2>/dev/null || true
echo "Swap disabled"

mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/volatile.conf <<'JOURNALD'
[Journal]
Storage=volatile
RuntimeMaxUse=32M
JOURNALD
systemctl restart systemd-journald
echo "Journald set to volatile (RAM only, 32M max)"

if ! grep -q "tmpfs /tmp" /etc/fstab; then
	echo "tmpfs /tmp tmpfs defaults,noatime,nosuid,nodev,size=64M 0 0" >> /etc/fstab
fi
if ! grep -q "tmpfs /var/tmp" /etc/fstab; then
	echo "tmpfs /var/tmp tmpfs defaults,noatime,nosuid,nodev,size=32M 0 0" >> /etc/fstab
fi

if grep -q " / " /etc/fstab && ! grep -q "noatime" /etc/fstab; then
	sed -i 's|\( / .*defaults\)|\1,noatime|' /etc/fstab
fi
echo "tmpfs and noatime configured (effective after reboot)"

# --- 9) Install systemd units ---
echo "Installing systemd units..."
cp "$RELAY_DIR/packages/relay/config/river-relay.service" /etc/systemd/system/
cp "$RELAY_DIR/packages/relay/config/river-relay-reset.service" /etc/systemd/system/
cp "$RELAY_DIR/packages/relay/config/river-relay-reset.timer" /etc/systemd/system/
cp "$RELAY_DIR/packages/relay/config/river-relay-boot-sync.service" /etc/systemd/system/
install -m 755 "$RELAY_DIR/packages/relay/scripts/boot-sync.sh" /usr/local/bin/river-relay-boot-sync.sh
systemctl daemon-reload
systemctl enable river-relay-boot-sync.service
systemctl enable river-relay.service
systemctl enable river-relay-reset.timer

# --- 10) Install app dependencies ---
echo "Installing relay dependencies..."
cd "$RELAY_DIR"
sudo -u "$RELAY_USER" bun install

# --- 11) Start services ---
echo "Starting relay service..."
systemctl start river-relay-boot-sync.service
systemctl start river-relay-reset.timer
systemctl start river-relay.service

echo ""
echo "==============================================="
echo "  Setup complete!"
echo "==============================================="
echo ""
echo "  Relay service: systemctl status river-relay"
echo "  Relay logs:    journalctl -u river-relay -f"
echo "  Tailscale:     tailscale status"
echo ""
