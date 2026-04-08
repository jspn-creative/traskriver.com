---
phase: 09-relay-deployment
verified: 2026-04-08T09:10:28Z
status: verified
score: 13/13 must-haves verified
gaps: []
---

# Phase 09: Relay Deployment Verification Report

**Phase Goal:** Deploy relay service on Raspberry Pi with idempotent provisioning and CI-driven updates
**Verified:** 2026-04-08T09:10:28Z
**Status:** verified
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | setup.sh installs Bun, ffmpeg, and Tailscale on a fresh Pi OS Lite | ✓ VERIFIED | `setup.sh` includes apt install for `ffmpeg/curl/git`, Bun install/copy to `/usr/local/bin/bun`, and Tailscale install + `tailscale up`. |
| 2 | setup.sh creates a relay user with no sudo and no login shell | ✓ VERIFIED | `useradd --system --shell /usr/sbin/nologin --home-dir "$RELAY_DIR" "$RELAY_USER"`. |
| 3 | setup.sh hardens the SD card: disables swap, volatile journald, tmpfs for /tmp and /var/tmp, noatime on root | ✓ VERIFIED | `dphys-swapfile` disable, journald `Storage=volatile`, `/etc/fstab` tmpfs + noatime edits present. |
| 4 | setup.sh moves .env from boot partition to /opt/river-relay/.env with chmod 600 and deletes boot copy | ✓ VERIFIED | Copies from `/boot/firmware/.env` or `/boot/.env`, `chmod 600`, `rm -f "$ENV_SRC"`. |
| 5 | setup.sh configures Tailscale as exit node using auth key from .env | ✓ VERIFIED | Parses `TAILSCALE_AUTHKEY` then runs `tailscale up --authkey=... --advertise-exit-node --ssh`. |
| 6 | river-relay.service starts relay on boot and restarts on crash with rate limiting | ✓ VERIFIED | Service includes `WantedBy=multi-user.target`, `Restart=always`, `RestartSec=5`, `StartLimitBurst=10`, `StartLimitIntervalSec=300`. |
| 7 | A timer resets the systemd failure counter periodically so relay always eventually recovers | ✓ VERIFIED | `river-relay-reset.timer` runs every 15m and oneshot executes `systemctl reset-failed river-relay.service`. |
| 8 | systemd unit has security hardening: NoNewPrivileges, ProtectSystem=strict, ReadWritePaths | ✓ VERIFIED | Present in `river-relay.service`. |
| 9 | configure.ts pulls latest code, installs deps, copies systemd unit, reloads daemon, and restarts the relay service | ✓ VERIFIED | Script runs `git pull --ff-only`, conditional `bun install`, unit sync, `systemctl daemon-reload`, `systemctl restart river-relay.service`. |
| 10 | configure.ts is idempotent and safe to re-run after .env or code changes | ✓ VERIFIED | Diff-based unit sync, lockfile-aware install skip path, repeatable restart flow. |
| 11 | GitHub Actions workflow triggers on push to main when packages/relay/** or packages/shared/** change | ✓ VERIFIED | Workflow `on.push.branches: [main]` with both path filters. |
| 12 | GitHub Actions SSHs into Pi via Tailscale and runs configure.ts | ✓ VERIFIED | Workflow uses `tailscale/github-action@v3` then SSH command invoking `bun run packages/relay/scripts/configure.ts`. |
| 13 | README documents rollback procedure: SSH via Tailscale, git checkout, service restart | ✓ VERIFIED | `README.md` has `## Rollback` with `ssh`, `git checkout`, `systemctl restart river-relay`. |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/relay/scripts/setup.sh` | One-time Pi OS provisioning script | ✓ VERIFIED | Exists, substantive, and wired to install systemd units + services. |
| `packages/relay/config/river-relay.service` | systemd service unit for relay | ✓ VERIFIED | Exists, substantive config, copied by setup/configure scripts. |
| `packages/relay/config/river-relay-reset.timer` | systemd timer for failure reset | ✓ VERIFIED | Exists, substantive, enabled/started by setup/configure. |
| `packages/relay/config/river-relay-reset.service` | oneshot for failure reset | ✓ VERIFIED | Exists, substantive, linked from timer. |
| `packages/relay/.env.example` | env template with Tailscale auth key | ✓ VERIFIED | Contains `TAILSCALE_AUTHKEY` and deploy vars. |
| `packages/relay/scripts/configure.ts` | idempotent deploy/config script | ✓ VERIFIED | Exists, substantive, invoked by CI and manual operator flow. |
| `.github/workflows/deploy-relay.yml` | relay CI/CD deploy workflow | ✓ VERIFIED | Exists, path-filtered, tailscale+ssh execution path present. |
| `packages/relay/README.md` | relay ops docs including rollback | ✓ VERIFIED | Exists, includes setup/deploy/rollback/secrets/ACL snippet. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `packages/relay/scripts/setup.sh` | `packages/relay/config/river-relay.service` | copies service file to `/etc/systemd/system/` | WIRED | `cp "$RELAY_DIR/packages/relay/config/river-relay.service" /etc/systemd/system/` present. |
| `packages/relay/config/river-relay.service` | `/opt/river-relay/.env` | `EnvironmentFile` directive | WIRED | `EnvironmentFile=/opt/river-relay/.env` present. |
| `.github/workflows/deploy-relay.yml` | `packages/relay/scripts/configure.ts` | SSH exec over Tailscale | WIRED | SSH command runs `bun run packages/relay/scripts/configure.ts`. |
| `packages/relay/scripts/configure.ts` | `packages/relay/config/river-relay.service` | copies unit to `/etc/systemd/system/` | WIRED | `UNITS` includes `river-relay.service`, synced to systemd dir via `Bun.write`. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| DEPL-01 | 09-01 | setup script installs deps + hardening bundle | ✓ SATISFIED | All install/hardening steps present. unattended-upgrades intentionally excluded per D-04 (avoid surprise reboots); requirement text updated to match. |
| DEPL-02 | 09-01 | hardened restarting systemd service with env file | ✓ SATISFIED | `river-relay.service` includes required restart, limits, hardening, env file directives. |
| DEPL-03 | 09-01 | periodic failure counter reset | ✓ SATISFIED | timer + oneshot reset-failed units implemented and wired. |
| DEPL-04 | 09-01 | boot `.env` moved to secure path and boot copy deleted | ✓ SATISFIED | `setup.sh` boot-path discovery, secure copy/chmod/chown, deletion logic present. |
| DEPL-05 | 09-01 | Tailscale exit-node setup | ✓ SATISFIED | `tailscale up --advertise-exit-node --ssh` with auth key parsing. |
| DEPL-06 | 09-02 | idempotent Bun deploy/config script | ✓ SATISFIED | `configure.ts` implements ff-only pull, lock-aware install, unit sync, restart, verification. |
| DEPL-07 | 09-01 | infra-as-code config: systemd units versioned in git, applied by script | ✓ SATISFIED | systemd service, timer, and reset units in `packages/relay/config/`; configure.ts syncs them. Requirement text narrowed to match implemented scope. |
| DEPL-08 | 09-02 | push-to-main deploy over Tailscale SSH | ✓ SATISFIED | workflow push trigger + relay/shared path filters + Tailscale + SSH configure execution present. |
| DEPL-09 | 09-02 | rollback over Tailscale SSH | ✓ SATISFIED | README rollback steps include SSH, `git checkout`, restart, verify commands. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `packages/relay/scripts/setup.sh` | 5 | TODO placeholder for repo URL | ⚠️ Warning | Fresh-device setup not fully zero-touch until placeholder is replaced. |
| `packages/relay/scripts/setup.sh` | 8 | `https://github.com/your-user/river-stream.git` placeholder | ⚠️ Warning | Clone step fails if operator forgets to customize URL. |

### Human Verification Required

1. **Tailscale remote manageability**
   - **Test:** From off-site machine, SSH to relay via MagicDNS hostname.
   - **Expected:** Successful SSH session, ability to inspect service logs/status.
   - **Why human:** Requires real Tailnet, ACL policy, and live relay host.

2. **CI-triggered deploy execution on real relay**
   - **Test:** Push a benign change under `packages/relay/`, observe GitHub Actions deploy job and post-deploy relay health.
   - **Expected:** Workflow connects over Tailscale, runs configure script, relay remains active.
   - **Why human:** Depends on external GitHub/Tailscale credentials and reachable hardware.

### Gaps Summary

All must-haves declared in plan frontmatter are implemented and wired. Requirement contract fully satisfied — DEPL-01 and DEPL-07 text updated to match design decisions (D-04: no unattended-upgrades; DEPL-07 narrowed to systemd units). Phase goal achieved.

---

_Verified: 2026-04-08T09:10:28Z_
_Verifier: Claude (gsd-verifier)_
