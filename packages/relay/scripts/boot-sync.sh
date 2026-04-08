#!/usr/bin/env bash
set -euo pipefail

RELAY_DIR="/opt/river-relay"
ENV_DEST="${RELAY_DIR}/.env"
WPA_DEST="/etc/wpa_supplicant/wpa_supplicant.conf"
RELAY_USER="relay"

log() {
	echo "[boot-sync] $*"
}

copy_if_exists() {
	local src="$1"
	local dest="$2"

	if [[ ! -f "$src" ]]; then
		return 1
	fi

	mkdir -p "$(dirname "$dest")"
	cp "$src" "$dest"
	return 0
}

sync_env() {
	local env_src=""
	if [[ -f /boot/firmware/.env ]]; then
		env_src="/boot/firmware/.env"
	elif [[ -f /boot/.env ]]; then
		env_src="/boot/.env"
	fi

	if [[ -z "$env_src" ]]; then
		log "No boot .env found; skipping"
		return 0
	fi

	copy_if_exists "$env_src" "$ENV_DEST"
	chmod 600 "$ENV_DEST"

	if id "$RELAY_USER" &>/dev/null; then
		chown "$RELAY_USER:$RELAY_USER" "$ENV_DEST"
	fi

	log "Applied ${env_src} -> ${ENV_DEST}"
}

sync_wpa() {
	local wpa_src=""
	if [[ -f /boot/firmware/wpa_supplicant.conf ]]; then
		wpa_src="/boot/firmware/wpa_supplicant.conf"
	elif [[ -f /boot/wpa_supplicant.conf ]]; then
		wpa_src="/boot/wpa_supplicant.conf"
	fi

	if [[ -z "$wpa_src" ]]; then
		log "No boot wpa_supplicant.conf found; skipping"
		return 0
	fi

	copy_if_exists "$wpa_src" "$WPA_DEST"
	chmod 600 "$WPA_DEST"
	chown root:root "$WPA_DEST"
	log "Applied ${wpa_src} -> ${WPA_DEST}"

	if systemctl is-active --quiet wpa_supplicant; then
		systemctl restart wpa_supplicant || true
		log "Restarted wpa_supplicant"
	fi
}

sync_env
sync_wpa
