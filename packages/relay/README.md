# River Stream Relay

TypeScript relay service that polls for viewer demand and streams RTSP to Cloudflare Stream via ffmpeg.

## Architecture

```text
[Viewer] -> POST /api/stream/demand -> [Cloudflare KV]
                                         | polls
                                     [Pi Relay]
                                         | ffmpeg
[Camera RTSP] ---------------------> [Cloudflare Stream RTMPS]
                                         | HLS
                                      [Viewer]
```

## Initial Setup

1. Flash Pi OS Lite to SD card.
2. Copy config files to the boot partition (FAT32):
   - `cp .env /Volumes/bootfs/.env` (macOS)
   - `cp .env /media/$USER/bootfs/.env` (Linux)
   - optional Wi-Fi config: `cp wpa_supplicant.conf /Volumes/bootfs/wpa_supplicant.conf`
3. Fill values from `.env.example`:
   - `STREAM_URL`
   - `RTSP_URL`
   - `DEMAND_API_URL`
   - `STATUS_API_URL`
   - `RELAY_BEARER_TOKEN`
   - `TAILSCALE_AUTHKEY`
4. Boot Pi, SSH in, run setup:
   - `sudo bash /boot/firmware/setup.sh`
   - or clone repo and run `sudo bash /tmp/river-stream/packages/relay/scripts/setup.sh`
5. `setup.sh` seeds `/opt/river-relay/.env` but keeps `/boot/.env` in place.
6. On every boot, `river-relay-boot-sync.service` reapplies:
   - `/boot/.env` (or `/boot/firmware/.env`) -> `/opt/river-relay/.env`
   - `/boot/wpa_supplicant.conf` (or `/boot/firmware/wpa_supplicant.conf`) -> `/etc/wpa_supplicant/wpa_supplicant.conf`

## Deployment

Automatic deploy: push to `main` with changes in `packages/relay/` or `packages/shared/`.

GitHub Actions flow:

1. Connect runner to Tailscale (`tailscale/github-action@v3`)
2. SSH to relay host over Tailnet
3. Run `bun run packages/relay/scripts/configure.ts`

Manual deploy:

```bash
ssh root@<pi-hostname>.ts.net
cd /opt/river-relay
bun run packages/relay/scripts/configure.ts
```

## Rollback

```bash
ssh root@<pi-hostname>.ts.net
cd /opt/river-relay
git log --oneline -10
git checkout <commit-hash>
bun install
systemctl restart river-relay
systemctl status river-relay
journalctl -u river-relay -n 20
```

Return to latest:

```bash
git checkout main
git pull
bun install
systemctl restart river-relay
```

## Operations

```bash
systemctl status river-relay
journalctl -u river-relay -f
curl http://<pi-hostname>.ts.net:9090/health
systemctl restart river-relay
systemctl stop river-relay
```

## GitHub Actions Secrets

| Secret                     | Description                   | Source                                                              |
| -------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| `TS_OAUTH_CLIENT_ID`       | Tailscale OAuth client ID     | [Tailscale OAuth](https://login.tailscale.com/admin/settings/oauth) |
| `TS_OAUTH_SECRET`          | Tailscale OAuth client secret | [Tailscale OAuth](https://login.tailscale.com/admin/settings/oauth) |
| `RELAY_TAILSCALE_HOSTNAME` | Pi MagicDNS hostname          | `tailscale status` on Pi                                            |

## Tailscale ACL Example (`tag:ci`)

```json
{
	"tagOwners": {
		"tag:ci": ["autogroup:admin"]
	},
	"grants": [
		{
			"src": ["tag:ci"],
			"dst": ["relay-hostname.tailnet.ts.net:22"],
			"ip": ["tcp:22"]
		}
	]
}
```

## File Structure

```text
packages/relay/
|- config/
|  |- river-relay.service
|  |- river-relay-reset.timer
|  |- river-relay-reset.service
|  \- river-relay-boot-sync.service
|- scripts/
|  |- setup.sh
|  |- boot-sync.sh
|  \- configure.ts
|- src/
|  |- index.ts
|  |- state-machine.ts
|  |- poller.ts
|  |- ffmpeg.ts
|  |- status-reporter.ts
|  |- health-server.ts
|  \- logger.ts
|- .env.example
\- README.md
```
