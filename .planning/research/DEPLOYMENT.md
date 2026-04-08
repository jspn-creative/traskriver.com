# Relay Device Deployment & Provisioning Research

**Date:** 2026-03-19
**Context:** Raspberry Pi (or similar) running a Bun/TypeScript relay service that polls a CF Worker demand API and manages an ffmpeg process. Must be fully unattended after initial setup.

---

## 1. OS Choice

### Options Compared

| Criteria                | Raspberry Pi OS Lite                             | Ubuntu Server for Pi                            | DietPi                                             |
| ----------------------- | ------------------------------------------------ | ----------------------------------------------- | -------------------------------------------------- |
| **Base**                | Debian Bookworm (custom kernel)                  | Ubuntu (generic arm64 kernel)                   | Debian (minimal layer on top)                      |
| **Footprint**           | ~450MB installed                                 | ~1.2GB installed                                | ~130MB installed                                   |
| **RAM at idle**         | ~50MB                                            | ~120MB                                          | ~30MB                                              |
| **Unattended upgrades** | Manual setup (`unattended-upgrades` package)     | Built-in (`unattended-upgrades` pre-configured) | DietPi auto-update system (`dietpi-update`)        |
| **Headless first boot** | Supported via Imager or boot partition files     | cloud-init supported natively                   | `dietpi.txt` + `dietpi-wifi.txt` on boot partition |
| **Package ecosystem**   | Full Debian repos + Raspberry Pi repos           | Full Ubuntu repos                               | Full Debian repos + DietPi software catalog        |
| **Kernel updates**      | Raspberry Pi Foundation maintained, Pi-optimized | Canonical maintained, generic arm64             | Uses upstream Debian/RPi kernel                    |
| **Community for Pi**    | Largest (official OS)                            | Large (Ubuntu general)                          | Medium (but very active for SBC use)               |

### Recommendation: Raspberry Pi OS Lite

**Why:**

- Best hardware compatibility for Pi (official kernel, firmware, GPU drivers)
- Smallest practical footprint of the mainstream options (DietPi is smaller but adds an opinionated tool layer)
- `unattended-upgrades` is easy to add and matches Debian stable's conservative update cadence -- ideal for a device you never want to break with an update
- Raspberry Pi Imager pre-configures WiFi, SSH, hostname, user account directly onto the boot partition -- zero on-site interaction needed
- ffmpeg is available in the default repos

**Why not DietPi:** DietPi's extra tooling (`dietpi-software`, `dietpi-update`, `dietpi-config`) adds an abstraction layer that's useful for multi-service setups but unnecessary overhead for a single-purpose relay. Its auto-update system is opinionated and harder to control than standard `unattended-upgrades`. If something breaks, debugging DietPi-specific behavior is harder than standard Debian.

**Why not Ubuntu Server:** Heavier footprint for no benefit. The generic arm64 kernel occasionally has Pi-specific regressions. cloud-init is nice but overkill when Pi Imager already handles first-boot config.

---

## 2. Network Credentials Provisioning

### Option A: Raspberry Pi Imager Advanced Settings (Recommended)

The official Raspberry Pi Imager (v1.8+) has a "gear" settings panel that writes directly to the boot partition:

- **WiFi SSID + password** (writes `wpa_supplicant.conf` or NetworkManager config)
- **SSH enabled** (writes empty `ssh` file to boot partition)
- **Username + password** (creates user on first boot)
- **Hostname**
- **Locale/timezone**

This is the simplest approach: flash the image, set all options in Imager, ship the SD card.

### Option B: Manual boot partition files (fallback)

If not using Pi Imager, place these files on the FAT32 boot partition:

```
# /boot/ssh (empty file -- enables SSH)

# /boot/wpa_supplicant.conf (Pi OS Bullseye and earlier)
country=US
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
network={
    ssid="SiteWiFiName"
    psk="password"
    key_mgmt=WPA-PSK
}

# For Bookworm+, NetworkManager is default:
# /boot/NetworkManager/system-connections/wifi.nmconnection
[connection]
id=SiteWiFi
type=wifi

[wifi]
ssid=SiteWiFiName

[wifi-security]
key-mgmt=wpa-psk
psk=password

[ipv4]
method=auto
```

### Option C: cloud-init (Ubuntu Server only)

Ubuntu Server for Pi supports cloud-init natively. Place `user-data` and `network-config` on the boot partition. Powerful but overkill for this use case and locks you into Ubuntu Server.

### Option D: Fallback AP Mode (advanced, for on-site config changes)

For cases where WiFi credentials need to change without SSH access:

1. Install `hostapd` + `dnsmasq`
2. A systemd timer checks connectivity every 60s
3. If no internet for 5+ minutes, Pi switches to AP mode (SSID: `relay-setup`)
4. User connects to AP, hits a captive portal (simple HTTP form) to enter new WiFi creds
5. Pi writes new NetworkManager config and reboots

**Verdict:** Not worth implementing for v3.0. Ethernet is more reliable for a fixed-location relay. If WiFi is required, pre-configure creds via Pi Imager. If creds change, SSH in via Tailscale and update remotely.

### Recommendation

**Use Pi Imager for initial provisioning. Default to Ethernet if possible** (zero config, survives router replacements better). If WiFi is required, Pi Imager handles it. For post-deployment network changes, use Tailscale SSH.

---

## 3. systemd Service Setup

### Service File Template

```ini
# /etc/systemd/system/river-relay.service

[Unit]
Description=River Stream Relay Service
Documentation=https://github.com/your-org/river-stream
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=relay
Group=relay
WorkingDirectory=/opt/river-relay
ExecStart=/usr/local/bin/bun run /opt/river-relay/index.ts
EnvironmentFile=/opt/river-relay/.env

# Restart policy
Restart=always
RestartSec=5
StartLimitIntervalSec=300
StartLimitBurst=10

# Watchdog (optional -- Bun would need to send sd_notify)
# WatchdogSec=60

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=/opt/river-relay/data

# Resource limits
MemoryMax=256M
CPUQuota=80%

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=river-relay

[Install]
WantedBy=multi-user.target
```

### Key Decisions

**`Type=simple`** -- Correct for Bun. The process starts and stays in foreground. Do not use `forking` (that's for daemons that fork themselves).

**Restart policy:**

- `Restart=always` -- Restart on any exit (clean or crash)
- `RestartSec=5` -- Wait 5 seconds between restarts (prevents thrashing)
- `StartLimitBurst=10` / `StartLimitIntervalSec=300` -- Max 10 restarts in 5 minutes. If exceeded, systemd stops trying. A separate watchdog timer can reset this (see below).

**Override for persistent failures:** Add a drop-in to reset the failure counter:

```ini
# /etc/systemd/system/river-relay-reset.timer
[Unit]
Description=Reset river-relay failure counter

[Timer]
OnCalendar=*:0/15
# Every 15 minutes

[Install]
WantedBy=timers.target

# /etc/systemd/system/river-relay-reset.service
[Unit]
Description=Reset river-relay failure counter

[Service]
Type=oneshot
ExecStart=/usr/bin/systemctl reset-failed river-relay.service
```

This ensures the relay always eventually restarts even after hitting the burst limit (e.g., if network was down for 5 minutes but comes back).

### Environment Variables

```ini
# /opt/river-relay/.env
CAMERA_RTSP_URL=rtsp://192.168.1.100:554/stream
CF_STREAM_LIVE_INPUT_KEY=abc123...
CF_STREAM_DEMAND_URL=https://your-worker.workers.dev/api/stream/demand
RELAY_POLL_INTERVAL_MS=5000
```

- `EnvironmentFile` keeps secrets out of the service file (which is readable by all users)
- The `.env` file should be owned by `relay:relay` with `chmod 600`
- systemd resolves the `EnvironmentFile` before dropping privileges, so root ownership also works

### Logging

**Use journald (default).** No file logging needed.

```bash
# View logs
journalctl -u river-relay -f          # follow
journalctl -u river-relay --since today
journalctl -u river-relay -n 100      # last 100 lines
```

journald handles log rotation automatically. Configure limits in `/etc/systemd/journald.conf`:

```ini
[Journal]
SystemMaxUse=50M
MaxRetentionSec=7d
Storage=volatile      # Write to tmpfs, not disk (SD card protection)
```

`Storage=volatile` writes logs to `/run/log/journal/` (tmpfs) instead of disk. Logs are lost on reboot but SD card is protected. For debugging, temporarily set `Storage=persistent` via Tailscale SSH.

### User Isolation

Create a dedicated `relay` user:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin relay
```

The service runs as `relay`, not root. The systemd security directives (`NoNewPrivileges`, `ProtectSystem=strict`, etc.) provide additional sandboxing.

---

## 4. SD Card Longevity

SD cards fail from write amplification. A relay running 24/7 is a write-heavy workload if not mitigated.

### Strategy: Minimize Writes, Accept Impermanence

#### 4a. Volatile journald (most impactful)

```ini
# /etc/systemd/journald.conf
[Journal]
Storage=volatile
SystemMaxUse=30M
```

This single change eliminates the largest source of continuous writes. Logs go to RAM and are lost on reboot -- acceptable for a relay that reports status to a remote API.

#### 4b. tmpfs for transient data

```bash
# /etc/fstab additions
tmpfs /tmp         tmpfs defaults,noatime,nosuid,size=64M 0 0
tmpfs /var/tmp     tmpfs defaults,noatime,nosuid,size=32M 0 0
tmpfs /var/log     tmpfs defaults,noatime,nosuid,size=32M 0 0
```

This moves all temporary files and logs to RAM. The relay's working data (if any) should also target a tmpfs path.

#### 4c. Disable swap

```bash
sudo dphys-swapfile swapoff
sudo dphys-swapfile uninstall
sudo systemctl disable dphys-swapfile
```

Swap on SD card is destructive. With 1-2GB RAM on a Pi, the relay + ffmpeg + Tailscale fit comfortably without swap. If OOM occurs, systemd's `MemoryMax` on the service file causes a clean restart rather than swapping.

#### 4d. Reduce filesystem writes

```bash
# /etc/fstab -- add noatime to root partition
PARTUUID=xxx-02  /  ext4  defaults,noatime,commit=600  0  1
```

- `noatime` -- Don't update access timestamps on every file read
- `commit=600` -- Flush filesystem journal every 10 minutes instead of every 5 seconds

#### 4e. Read-only root filesystem (advanced, optional)

A fully read-only root (`overlayfs` on top of read-only ext4) is the gold standard for SD card longevity but adds significant complexity:

- Package updates require remounting rw
- Any config change requires remount
- Pi OS has experimental support via `raspi-config` -> Overlay FS

**Verdict:** Not worth it for v3.0. The combination of volatile journald + tmpfs + noatime + no swap reduces writes by ~95%. A quality SD card (Samsung EVO, SanDisk Extreme) will last years under this regime. If SD failure is a concern, consider an eMMC module or USB-booted SSD (Pi 4/5 support USB boot natively).

#### 4f. SD card choice

- **Samsung EVO Plus 32GB** or **SanDisk Extreme 32GB** -- Both rated for high endurance
- **Samsung PRO Endurance** -- Specifically designed for continuous recording, best option
- Avoid: cheap no-name cards, cards larger than 64GB (higher failure rates on Pi)

---

## 5. Remote Management Without Port Forwarding

The relay is behind NAT with no static IP. All options use outbound-only connections.

### Option A: Tailscale (Recommended)

**What it is:** WireGuard-based mesh VPN. The Pi makes an outbound connection to Tailscale's coordination server. You SSH to the Pi's Tailscale IP (100.x.y.z) from any device on your tailnet.

**Setup:**

```bash
# Install
curl -fsSL https://tailscale.com/install.sh | sh

# Authenticate with pre-generated auth key (no browser needed on Pi)
sudo tailscale up --auth-key=tskey-auth-XXXX --hostname=river-relay

# Disable key expiry for this device in Tailscale admin console
```

**Why Tailscale:**

- Free tier: 100 devices, 3 users -- more than sufficient
- Outbound-only: works behind any NAT, no port forwarding
- Auth keys allow headless setup (no browser login on the Pi)
- Tagged devices + ACLs: restrict what the relay can access
- Tailscale SSH: optional, provides browser-based SSH without even installing an SSH client
- Survives IP changes, network switches, router reboots
- ~15MB RAM overhead, negligible CPU
- systemd integration: `tailscaled` runs as a service, auto-starts on boot

**Auth key setup for unattended provisioning:**

1. Generate a reusable, tagged auth key in Tailscale admin (Settings -> Keys -> Generate auth key)
2. Set tag: `tag:relay`
3. Enable "Pre-approved" if device approval is on
4. Key expiry: 90 days (generate a new one before each deployment, or use OAuth client for programmatic keys)
5. Disable node key expiry on the device after it joins (prevents re-auth lockout)

### Option B: Reverse SSH Tunnel

```bash
# On the Pi, connect to a known server
autossh -M 0 -f -N -R 2222:localhost:22 user@your-server.com
```

**Pros:** No third-party dependency.
**Cons:** Requires maintaining a public server with a static IP. autossh can be flaky. More moving parts than Tailscale.

### Option C: Cloudflare Tunnel

```bash
cloudflared tunnel --url ssh://localhost:22
```

**Pros:** Already in CF ecosystem. No Tailscale account needed.
**Cons:** Cloudflare Tunnel for SSH requires `cloudflared` on the client side too (or browser-rendered SSH via CF Access, which requires a paid plan for SSH). More complex ACL setup. Tailscale is simpler for pure SSH access.

### Option D: Auto-update from Git on a Timer

```bash
# /etc/systemd/system/relay-update.timer
[Timer]
OnCalendar=*:0/30
# Every 30 minutes

# relay-update.service pulls from git and restarts
ExecStart=/opt/river-relay/scripts/self-update.sh
```

**Pros:** No SSH needed for code updates.
**Cons:** Doesn't help with debugging, log inspection, or OS-level maintenance. Should be a supplement to Tailscale SSH, not a replacement.

### Recommendation

**Use Tailscale as the primary remote access method.** Optionally add a git-based auto-update timer for code deployments. Tailscale is zero-config after initial setup, works behind any NAT, and the free tier is more than sufficient.

---

## 6. Provisioning Script / Image

### Options Compared

| Approach          | On-site effort                   | Reproducibility          | Maintenance                    | Complexity  |
| ----------------- | -------------------------------- | ------------------------ | ------------------------------ | ----------- |
| Bash setup script | Flash OS + run script via SSH    | High (idempotent script) | Easy to update                 | Low         |
| Custom Pi image   | Flash custom image               | Highest (exact clone)    | Hard to update (rebuild image) | Medium      |
| Ansible playbook  | Flash OS + run playbook remotely | High                     | Easy to update                 | Medium-High |
| DietPi automation | Flash DietPi + `dietpi.txt`      | Medium                   | Tied to DietPi tooling         | Medium      |

### Recommendation: Bash Setup Script (with Pi Imager for base)

**Why:** Lowest complexity, easiest to iterate. A single `setup.sh` that runs on a fresh Pi OS Lite install handles everything. The script is version-controlled in the relay repo.

**Provisioning flow:**

1. Flash Raspberry Pi OS Lite with Pi Imager (set hostname, SSH, WiFi, user)
2. Ship SD card + Pi to site
3. On-site person plugs in power + ethernet (or WiFi is pre-configured)
4. Pi boots, connects to network, Tailscale comes up (if pre-installed in image) or:
5. SSH in via local network (first time only), run: `curl -fsSL https://your-domain.com/relay-setup.sh | bash`
6. Script does everything, Pi reboots into operational state

**Even better: Bake Tailscale + auth key into the Pi Imager `firstrun.sh`:**

Pi Imager writes a `firstrun.sh` script to the boot partition. You can append to it (or use a custom `cmdline.txt` init hook) to install Tailscale + run the setup script on first boot. This reduces on-site effort to literally just "plug in power + ethernet."

### Setup Script Outline

```bash
#!/usr/bin/env bash
set -euo pipefail

# --- System ---
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y ffmpeg unzip git

# --- Disable swap ---
sudo dphys-swapfile swapoff
sudo dphys-swapfile uninstall
sudo systemctl disable dphys-swapfile

# --- Bun runtime ---
curl -fsSL https://bun.sh/install | bash
sudo ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun

# --- Tailscale ---
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --auth-key="${TAILSCALE_AUTH_KEY}" --hostname=river-relay

# --- Create relay user ---
sudo useradd --system --no-create-home --shell /usr/sbin/nologin relay

# --- Deploy relay code ---
sudo mkdir -p /opt/river-relay
sudo git clone https://github.com/your-org/river-stream.git /opt/river-relay
# Or: download a release tarball
sudo chown -R relay:relay /opt/river-relay

# --- Install dependencies ---
cd /opt/river-relay/relay
sudo -u relay bun install --production

# --- Environment file ---
# (Copied from USB drive, fetched from API, or pre-baked)
sudo cp /boot/relay.env /opt/river-relay/.env
sudo chown relay:relay /opt/river-relay/.env
sudo chmod 600 /opt/river-relay/.env

# --- systemd service ---
sudo cp /opt/river-relay/relay/river-relay.service /etc/systemd/system/
sudo cp /opt/river-relay/relay/river-relay-reset.timer /etc/systemd/system/
sudo cp /opt/river-relay/relay/river-relay-reset.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now river-relay.service
sudo systemctl enable --now river-relay-reset.timer

# --- SD card optimizations ---
# Set journald to volatile
sudo sed -i 's/#Storage=auto/Storage=volatile/' /etc/systemd/journald.conf
sudo sed -i 's/#SystemMaxUse=/SystemMaxUse=30M/' /etc/systemd/journald.conf

# Add noatime to root partition
sudo sed -i 's/defaults/defaults,noatime,commit=600/' /etc/fstab

# --- Unattended upgrades ---
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# --- tmpfs for /tmp ---
echo 'tmpfs /tmp tmpfs defaults,noatime,nosuid,size=64M 0 0' | sudo tee -a /etc/fstab

# --- Reboot ---
sudo reboot
```

### Why Not a Custom Image

Custom images (via `pi-gen` or `imgclone`) are ideal when deploying 10+ identical devices. For a single relay (or a handful), the overhead of maintaining a custom image pipeline isn't justified. A setup script achieves the same result with less tooling.

### Why Not Ansible

Ansible is excellent for fleet management but overkill for a single device. If the project scales to multiple relay sites, migrate the setup script to an Ansible playbook -- the steps map 1:1.

---

## 7. Environment Variables & Secrets

The relay needs these secrets:

- `CAMERA_RTSP_URL` -- RTSP address of the IP camera on local network
- `CF_STREAM_LIVE_INPUT_KEY` -- Cloudflare Stream live input key
- `CF_STREAM_DEMAND_URL` -- Worker demand API endpoint (not secret, but site-specific)
- `RELAY_POLL_INTERVAL_MS` -- Polling interval (not secret)

### Options Compared

| Approach                       | Security                                 | On-site effort                 | Updatability                    |
| ------------------------------ | ---------------------------------------- | ------------------------------ | ------------------------------- |
| Baked into image               | Poor (secrets in the SD card image file) | Zero                           | Requires reflash                |
| `.env` on boot partition       | Medium (FAT32, readable if card removed) | Zero (placed during flash)     | Requires physical access or SSH |
| `.env` via USB drive           | Good (removable, can keep separate)      | Low (plug in USB during setup) | Replace USB + reboot            |
| Fetched on first boot from API | Best (secrets never stored in image)     | Zero                           | API-driven                      |
| Encrypted config partition     | Good                                     | Medium (encryption key needed) | Complex                         |

### Recommendation: `.env` on Boot Partition + Tailscale for Updates

**For v3.0 (single device, simple setup):**

1. During Pi Imager flash, place `relay.env` on the FAT32 boot partition
2. The setup script moves it to `/opt/river-relay/.env` with `chmod 600` and removes the boot copy
3. For updates: SSH in via Tailscale and edit `.env` directly

**Why this is sufficient:**

- The SD card is physically inside the Pi at the deployment site -- physical access to the card means physical access to the camera anyway
- The boot partition copy is deleted on first boot
- The `.env` file is readable only by the `relay` user after setup
- Secrets are not in git, not in the image file, not in the setup script

**Future upgrade (multiple devices):** Fetch secrets from a secure API on first boot:

```bash
# In setup script:
DEVICE_TOKEN=$(cat /boot/device-token)  # One-time token placed during flash
curl -s -H "Authorization: Bearer $DEVICE_TOKEN" \
  https://your-worker.workers.dev/api/relay/provision \
  -o /opt/river-relay/.env
rm /boot/device-token
```

The Worker validates the one-time token, returns the `.env` contents, and invalidates the token. This way, no secrets are ever on the SD card image.

---

## 8. Summary: Recommended Stack

| Layer                    | Choice                                                | Rationale                                                                 |
| ------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| **OS**                   | Raspberry Pi OS Lite (Bookworm)                       | Best Pi hardware support, minimal footprint, stable Debian base           |
| **Network provisioning** | Pi Imager advanced settings                           | Zero on-site config, writes WiFi/SSH/hostname to boot partition           |
| **Runtime**              | Bun (aarch64 Linux)                                   | Already used in project, single binary, fast startup                      |
| **Process manager**      | systemd (`Type=simple`, `Restart=always`)             | Native, reliable, handles boot/crash/restart                              |
| **Logging**              | journald (`Storage=volatile`)                         | Zero SD card wear, adequate for a relay that reports status via API       |
| **SD card protection**   | Volatile journald + tmpfs + noatime + no swap         | ~95% write reduction without read-only root complexity                    |
| **Remote access**        | Tailscale (free tier, auth key)                       | Outbound-only, works behind any NAT, zero port forwarding                 |
| **Provisioning**         | Bash setup script (version-controlled in repo)        | Simple, reproducible, easy to iterate                                     |
| **Secrets**              | `.env` on boot partition, moved on first boot         | Simple, sufficient for single device; upgrade path to API-fetched secrets |
| **Auto-update**          | Optional git pull timer (supplement to Tailscale SSH) | Code updates without SSH; debugging still requires Tailscale              |

### On-Site Setup Effort

With this stack, the on-site person does:

1. Plug in power cable
2. Plug in ethernet cable (or WiFi is pre-configured)
3. Done

Everything else is pre-configured on the SD card or runs automatically on first boot.

---

## 9. Open Questions for Implementation

1. **Bun on Pi:** Bun supports `linux-aarch64` (ARM64). The Pi 4/5 run 64-bit OS. Verify Bun ARM64 binary works on Pi OS Lite (kernel 5.15+, glibc 2.36+). Fallback: Node.js 20 LTS is universally supported on Pi.

2. **ffmpeg resource usage:** Monitor CPU/memory of ffmpeg RTSP->RTMPS transcode on Pi 4 (quad-core A72). If `copy` codec is used (no transcode), CPU usage is minimal. If re-encoding is needed, Pi 4 may struggle with 1080p.

3. **Camera discovery:** The RTSP URL is hardcoded. If the camera's IP changes (DHCP), the relay breaks. Consider: static IP for camera, or mDNS/ONVIF discovery.

4. **Health reporting:** The relay should report its status to the Worker API (alive, ffmpeg running, last successful poll, error state). This enables the web frontend to show "Relay offline" vs "Stream starting" vs "Live".

5. **Graceful ffmpeg shutdown:** When demand expires, the relay must SIGTERM ffmpeg and wait for it to finish the current segment. Bun's `subprocess.kill()` should handle this, but test for zombie processes.

---

_Research date: 2026-03-19_
