---
phase: 09
reviewers: [gemini]
reviewed_at: 2026-04-08T03:06:30Z
plans_reviewed: [09-01-PLAN.md, 09-02-PLAN.md]
---

# Cross-AI Plan Review - Phase 09

## Gemini Review

This review evaluates the implementation plans for **Phase 09: Relay Deployment**.

### 1. Summary
The plans provide a comprehensive and production-ready strategy for provisioning Raspberry Pi hardware and establishing a robust CI/CD pipeline. By splitting logic into OS-level provisioning (`setup.sh`) and app-level idempotent configuration (`configure.ts`), the strategy ensures that the infrastructure is both easy to stand up and simple to maintain. The focus on SD card longevity and automatic recovery from transient failures demonstrates a deep understanding of the constraints of headless IoT-style deployments.

### 2. Strengths
* **Hardware Longevity**: The SD card hardening measures (disabling swap, volatile `journald`, `tmpfs` for `/tmp`, and `noatime`) are excellent for preventing SD card wear, which is the leading cause of failure in Pi-based deployments.
* **Operational Resilience**: The use of a dedicated systemd timer (`river-relay-reset.timer`) to reset the failure counter is a clever "watchdog" pattern. It ensures the relay will eventually try to restart even after exceeding systemd's `StartLimitBurst` during a prolonged outage.
* **Security Sandboxing**: The `river-relay.service` uses modern systemd security directives (`NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`) and runs under a non-privileged system user, minimizing the blast radius of a potential compromise.
* **Idempotent Deployments**: `configure.ts` correctly handles the complexity of monorepo updates by performing `git pull`, `bun install`, and diff-based systemd unit synchronization, making it safe to run manually or via CI.
* **Tailscale Integration**: Leveraging Tailscale SSH and OAuth tags simplifies remote management and CI/CD security without the overhead of managing static SSH keys.

### 3. Concerns
* **Bash Compatibility in `.env`** (Severity: **LOW**): `setup.sh` uses `source "$ENV_SRC"` to read `TAILSCALE_AUTHKEY`. If the `.env` file contains characters or formatting invalid in Bash (but valid in Bun/Node), the setup script will crash.
* **Monorepo Disk Footprint** (Severity: **LOW**): Clones the entire monorepo to the Pi. While fine for now, as the `web` package grows with assets (images, etc.), this may lead to unnecessary disk usage and slower `git pull` operations on a device that only needs `relay` and `shared`.
* **Deployment Stalls** (Severity: **MEDIUM**): If `configure.ts` fails during a GitHub Action (e.g., `bun install` error), the service might be left in a stopped or inconsistent state. The plan relies on manual rollback (documented in README), which is acceptable for v3.0 but should be noted.

### 4. Suggestions
* **Sparse Checkout**: In `setup.sh`, consider using a sparse checkout for `packages/relay` and `packages/shared` to keep the Pi's disk footprint minimal and speed up deployments.
* **Health Verification**: Enhance the verification step in `configure.ts` to hit the `/health` endpoint (already implemented in Phase 07) instead of just checking `systemctl is-active`. This confirms the application is actually processing demand, not just running as a "zombie" process.
* **Dependency Check**: In `configure.ts`, add a check to see if `bun.lock` has changed before running `bun install` to speed up the common "code-only" deployment path.
* **Tailscale ACL Documentation**: Explicitly add the required Tailscale ACL JSON snippet to the README so the operator knows how to authorize the `tag:ci` used in the GitHub Actions workflow.

### 5. Risk Assessment: LOW
The plans are highly detailed and follow industry best practices for Raspberry Pi deployment. The risks are primarily operational (deployment stalls) rather than architectural. The dependency on Plan 01 for Plan 02 is correctly mapped, and the success criteria for the phase are fully addressed. Implementation can proceed with high confidence.

---

## Consensus Summary

Single-reviewer run (`gemini` only). No cross-reviewer consensus or divergence analysis available.

### Agreed Strengths

- N/A (requires 2+ reviewers)

### Agreed Concerns

- N/A (requires 2+ reviewers)

### Divergent Views

- N/A (requires 2+ reviewers)
