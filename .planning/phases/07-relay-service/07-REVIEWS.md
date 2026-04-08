---
phase: 7
reviewers: [gemini]
reviewed_at: 2026-04-07T00:00:00Z
plans_reviewed: [07-01-PLAN.md, 07-02-PLAN.md]
---

# Cross-AI Plan Review — Phase 7

## Gemini Review

This is a high-quality, robust implementation plan for the Relay Service. It demonstrates a strong understanding of process management, state synchronization, and failure modes inherent in edge hardware (like a Raspberry Pi or similar relay device). Using a formal state machine and `setTimeout` chaining (instead of `setInterval`) are professional choices that will prevent "process stampedes" and race conditions.

### Summary
The plan is comprehensive, idiomatic (leveraging Bun's high-performance primitives), and directly addresses the stability requirements of a remote relay service. It correctly prioritizes safety policies (the "dead man's switch" for network partitions) and clean process termination. The separation of concerns between the state machine, poller, and ffmpeg manager makes the service testable and maintainable.

### Strengths
*   **State Machine Rigor**: Explicitly defining transitions (e.g., requiring a `cooldown` after a failure) prevents the relay from entering a rapid "crash-loop" that could overwhelm the IP camera or Cloudflare's ingest servers.
*   **Bun-Native Implementation**: Using `Bun.spawn` and its `exited` promise is more efficient and provides better ergonomic control over subprocesses than Node's `child_process`.
*   **Safety Policies**: The inclusion of a 5-minute consecutive failure threshold (RLAY-06) is critical for hardware that might be left unattended; it ensures the stream doesn't run indefinitely if the control plane (Worker) becomes unreachable.
*   **Clean Shutdown**: The SIGTERM + 10s SIGKILL fallback is the "gold standard" for ensuring `ffmpeg` doesn't leave orphaned processes or lock up the hardware's resources.
*   **Request Timeouts**: Using `AbortSignal.timeout` on polls prevents the relay from hanging indefinitely on a slow network.

### Concerns
*   **FFmpeg Diagnostic Visibility** (MEDIUM): The plan doesn't explicitly mention capturing or logging `ffmpeg`'s `stderr`. In a production environment, 90% of "stream failed" issues are found in the ffmpeg logs (e.g., "RTSP 401 Unauthorized" or "Connection refused"). Without piping these to the structured logger, remote debugging will be difficult.
*   **Definition of "Live"** (LOW): The transition `starting → live` is triggered by "ffmpeg confirmed running." If this transition happens immediately after spawning, a "successful" start followed by a crash 2 seconds later (due to a bad RTSP URL) might trigger a rapid state flip.
*   **FFmpeg Versioning/Environment** (LOW): The plan assumes `ffmpeg` is in the system PATH. While reasonable, a production relay usually benefits from an explicit path configuration or a check at startup.

### Suggestions
*   **Pipe FFmpeg Output**: In `FfmpegManager.start()`, ensure `stderr: "pipe"` is used. You should either log the last few lines on failure or stream them to the logger at a `debug` level to help diagnose connectivity issues with the IP camera.
*   **Initial Status Report**: Modify the startup sequence to perform an immediate `report("idle")` or `report("started")` before the first poll. This provides immediate feedback that the hardware has rebooted and the service is alive.
*   **Debounce "Live" Transition**: Consider a 3-5 second delay in the `starting` state where the process must remain alive before transitioning to `live`. This ensures that the `live` status reported to the Worker is meaningful.
*   **Health Check Endpoint**: If the relay is on a local network, a tiny `Bun.serve` instance on the relay that returns the current state can be invaluable for local troubleshooting without SSH-ing into the box.

### Risk Assessment: LOW
The plan is technically sound and includes sufficient safety nets. The risks are primarily operational (logging visibility) rather than architectural. The dependency on Phase 6 is clearly noted, and the state machine logic provides a predictable recovery path for the most common failure (ffmpeg crashing due to temporary RTSP dropouts).

---

## Consensus Summary

With a single reviewer (Gemini), the consensus is based on that review alone.

### Agreed Strengths
- State machine with explicit transition validation prevents crash-loops and race conditions
- Safety policies (consecutive failure threshold, SIGTERM/SIGKILL shutdown) are well-designed for unattended hardware
- Bun-native primitives (Bun.spawn, AbortSignal.timeout) are idiomatic and efficient
- setTimeout chaining over setInterval prevents process stampedes
- Clean separation of concerns (state machine, poller, ffmpeg manager, status reporter) enables testability

### Agreed Concerns
- **MEDIUM — ffmpeg stderr not captured**: The plan pipes stderr but doesn't explicitly log it. ffmpeg diagnostic output is critical for remote debugging of stream failures (RTSP auth errors, connection refused, codec issues). This is the single most important gap to address.
- **LOW — "live" transition too eager**: Transitioning to `live` immediately after spawn could produce rapid state flips if ffmpeg crashes within seconds of starting. A short debounce (3-5s) would make the `live` status meaningful.
- **LOW — ffmpeg PATH assumption**: No startup check that ffmpeg exists or is the expected version. A pre-flight check would catch misconfigured relay devices early.

### Divergent Views
N/A — single reviewer. Consider re-running with additional CLIs for adversarial coverage.
