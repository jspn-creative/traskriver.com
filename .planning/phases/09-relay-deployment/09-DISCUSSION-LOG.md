# Phase 09: Relay Deployment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 09-relay-deployment
**Areas discussed:** Setup script scope, Secret management, Deploy pipeline, Systemd service design

---

## Setup Script Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Single setup.sh does all | One script, one run, done. configure.ts only for re-deploy/update. | |
| Split: setup.sh + configure.ts | setup.sh for OS-level, configure.ts for app-level. configure.ts is re-runnable. | ✓ |

**User's choice:** Split: setup.sh + configure.ts
**Notes:** Recommended option selected.

| Option | Description | Selected |
|--------|-------------|----------|
| All five hardening measures | Disable swap, volatile journald, tmpfs, noatime, unattended-upgrades | |
| Skip unattended-upgrades | Manual updates only via Tailscale SSH. Avoids surprise reboots. | ✓ |
| You decide | Agent picks hardening set | |

**User's choice:** Skip unattended-upgrades
**Notes:** Concern about surprise reboots on headless device.

| Option | Description | Selected |
|--------|-------------|----------|
| /opt/river-relay | Standard location for third-party services. Owned by relay user. | ✓ |
| /home/relay/river-relay | Under relay user's home directory. | |

**User's choice:** /opt/river-relay

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated relay user | Separate user, no sudo, no login shell. Better security isolation. | ✓ |
| Use default pi user | Simpler setup, less isolation. | |

**User's choice:** Dedicated relay user

---

## Secret Management

| Option | Description | Selected |
|--------|-------------|----------|
| Manual file copy during flash | Mount boot partition, copy .env manually. | |
| setup.sh moves it from /boot | setup.sh handles the move automatically from boot partition. | ✓ |
| You decide | Agent picks mechanism. | |

**User's choice:** setup.sh moves it from /boot

| Option | Description | Selected |
|--------|-------------|----------|
| Tailscale auth key in .env | Single .env has everything: relay secrets + Tailscale auth key. | ✓ |
| Separate Tailscale setup | Tailscale configured separately from relay .env. | |

**User's choice:** Tailscale auth key in .env
**Notes:** Single file to manage.

| Option | Description | Selected |
|--------|-------------|----------|
| Exit node enabled | Route traffic through Pi to access camera LAN remotely. | ✓ |
| Standard node, SSH only | Only SSH access to the Pi itself. | |

**User's choice:** Exit node enabled
**Notes:** Useful for accessing camera web UI for debugging.

---

## Deploy Pipeline

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Actions workflow | Push to main triggers Actions job that SSHs into Pi over Tailscale. | ✓ |
| Cloudflare Worker webhook | Worker receives webhook, calls deploy endpoint on Pi. | |
| Pi listens for webhooks directly | Pi runs HTTP listener that GitHub calls. | |

**User's choice:** GitHub Actions workflow with path filtering
**Notes:** User specified path filtering — only changes to packages/relay/ and packages/shared/ should trigger deploy. CSS fixes in packages/web/ should not trigger.

| Option | Description | Selected |
|--------|-------------|----------|
| Git pull + bun install + restart | Minimal idempotent deploy. | |
| Full idempotent: also copy systemd unit | Same plus systemd unit copy, daemon-reload, then restart. | ✓ |
| You decide | Agent picks operations. | |

**User's choice:** Full idempotent: also copy systemd unit

| Option | Description | Selected |
|--------|-------------|----------|
| Manual SSH rollback | Operator SSHs in, git checkout + restart. Documented in README. | ✓ |
| Config script --rollback flag | configure.ts --rollback <commit> automates it. | |

**User's choice:** Manual SSH rollback
**Notes:** User initially wanted a Bun.serve admin UI with rollback button accessible via MagicDNS from phone. Agreed this is a new capability — deferred to future enhancement.

---

## Systemd Service Design

| Option | Description | Selected |
|--------|-------------|----------|
| bun run src/index.ts | Run TypeScript directly via Bun. No build step. | ✓ |
| Pre-built dist/index.js | Requires build step during deploy. Slightly faster startup. | |

**User's choice:** bun run src/index.ts

| Option | Description | Selected |
|--------|-------------|----------|
| As specified: 10/5min + 15min reset | RestartSec=5, StartLimitBurst=10, StartLimitIntervalSec=300. | |
| More aggressive: 5/3min + 10min reset | Faster rate limit, faster recovery. | |
| You decide | Agent picks values based on relay crash patterns. | ✓ |

**User's choice:** You decide

| Option | Description | Selected |
|--------|-------------|----------|
| Moderate sandboxing | NoNewPrivileges + ProtectSystem=strict. Sufficient for single-purpose device. | ✓ |
| Full sandbox | Additional hardening (PrivateTmp, ProtectHome, etc). May interfere with Bun/ffmpeg. | |
| You decide | Agent picks appropriate hardening. | |

**User's choice:** Moderate: NoNewPrivileges + ProtectSystem=strict

| Option | Description | Selected |
|--------|-------------|----------|
| EnvironmentFile in systemd | systemd loads .env before starting. Clean separation. | ✓ |
| Relay loads .env itself | Bun's built-in .env support. More portable. | |

**User's choice:** EnvironmentFile in systemd

---

## Agent's Discretion

- Restart rate limit values and timer reset interval
- Tailscale setup flags beyond --authkey and --advertise-exit-node
- Git clone strategy for setup.sh
- Whether configure.ts checks lockfile before bun install
- Network block config structure

## Deferred Ideas

- Relay admin web UI (Bun.serve with rollback button via MagicDNS) — future enhancement
