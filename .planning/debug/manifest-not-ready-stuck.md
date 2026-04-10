---
status: awaiting_human_verify
trigger: 'manifest-not-ready-stuck: Relay says live but VideoPlayer stuck on "manifest not ready — waiting" forever'
created: 2026-04-13T00:00:00Z
updated: 2026-04-13T00:02:00Z
---

## Current Focus

hypothesis: CONFIRMED — manifestParsingError handler silently swallowed fatal HLS.js errors, preventing recovery. Fix applied: only suppress non-fatal manifestParsingError; let fatal ones trigger the remount timer.
test: svelte-check passes, production build succeeds
expecting: User verifies with live stream that player recovers within ~10-15 seconds instead of being stuck forever
next_action: Await user verification with live stream

## Symptoms

expected: When relay says "live", the video should start playing within seconds.
actual: VideoPlayer logs "[VideoPlayer] manifest not ready — waiting" and never progresses. Even after 2+ minutes and trying new tabs, no change.
errors: "[VideoPlayer] manifest not ready — waiting" is the last console message, then nothing changes.
reproduction: Start stream, wait for relay to report live, load page in browser. VideoPlayer never gets past "manifest not ready".
started: After fixes from stream-standby-stuck debug session were applied.

## Eliminated

## Evidence

- timestamp: 2026-04-13T00:00:30Z
  checked: VideoPlayer.svelte hls-error handler flow (lines 73-98)
  found: The handler checks for manifestParsingError at line 84 and returns BEFORE the isFatal check at line 89. If HLS.js fires a FATAL manifestParsingError (which it does — manifest parse failure is fatal in HLS.js), the handler returns early, hasError is never set to true, and the remount timer (lines 137-150) never fires. HLS.js is dead but the code doesn't know.
  implication: This is the root cause. The previous fix treated manifestParsingError as "expected startup condition" but failed to account for HLS.js stopping on fatal errors. The player gets permanently stuck.

- timestamp: 2026-04-13T00:00:45Z
  checked: Full pipeline from relay "live" to HLS manifest
  found: Relay transitions to 'live' after ffmpeg runs for 4s (liveConfirmMs). But CF Stream needs additional time to ingest RTMP and produce HLS segments (10-30+ seconds). So when VideoPlayer mounts (showPlayer=true during phase='live'), the CF Stream manifest is typically not ready yet. HLS.js fetches it, gets a parsing error (empty/invalid manifest), fires fatal manifestParsingError, and dies.
  implication: There's a structural timing gap: relay 'live' means "ffmpeg is running" but NOT "HLS manifest is ready". The VideoPlayer must handle this gap by retrying after fatal manifestParsingError.

- timestamp: 2026-04-13T00:01:00Z
  checked: Remount timer logic (lines 137-150)
  found: Timer only activates when hasError=true AND sessionActive=true AND !isPlaying. Since manifestParsingError never sets hasError, the timer never starts. The 10-second remount that would recover from this exact situation is dead code in this path.
  implication: The fix is to NOT suppress fatal manifestParsingError. Instead, treat it like any other fatal error so the remount timer can recover.

- timestamp: 2026-04-13T00:01:10Z
  checked: Why the user sees "manifest not ready — waiting" but then nothing
  found: The console.debug fires once per manifestParsingError. HLS.js fires this once (it's fatal, it stops). After that, no more HLS activity occurs. No errors, no retries. The player is dead silent. The UI shows poster image with no indication of a problem.
  implication: User sees a single log message then nothing — consistent with HLS.js dying on a fatal error.

- timestamp: 2026-04-13T00:01:30Z
  checked: Recovery behavior after fix
  found: After fix, fatal manifestParsingError falls through to hasError=true + onError(). The page's onPlaybackError sets streamError=true but stays in 'live' phase. showPlayer remains true, VideoPlayer stays mounted. The remount timer fires after 10s, creating a fresh HLS.js instance. If CF Stream still isn't ready, cycle repeats every ~10s. Once CF Stream produces valid HLS, playback succeeds.
  implication: Fix creates a self-healing retry loop with 10-second intervals until CF Stream is ready.

- timestamp: 2026-04-13T00:02:00Z
  checked: Build verification
  found: svelte-check: 0 errors, 0 warnings. bun run build: successful production build. svelte-autofixer: 0 issues.
  implication: Fix is syntactically and semantically valid.

## Resolution

root_cause: |
The hls-error handler in VideoPlayer.svelte silently swallowed fatal `manifestParsingError` events.

When the relay reports "live", the VideoPlayer mounts and HLS.js fetches the CF Stream manifest. But CF Stream needs 10-30+ seconds after RTMP ingestion starts to produce a valid HLS manifest. During this gap, CF Stream returns an empty or invalid manifest, causing HLS.js to fire a **fatal** `manifestParsingError`.

The error handler (line 84) caught `manifestParsingError` and returned early — before the `isFatal` check at line 89. This meant:

1. `hasError` was never set to `true`
2. The 10-second remount timer (which requires `hasError=true`) never activated
3. HLS.js was dead (fatal error = stopped) but the code didn't know
4. The player sat permanently in a dead state, showing "manifest not ready — waiting" once then silence

Introduced by the previous debug session (stream-standby-stuck) which correctly identified manifestParsingError as "expected during startup" but incorrectly treated ALL instances as safe to silently ignore, including fatal ones.

fix: |
Changed the manifestParsingError guard from unconditional to non-fatal-only:

Before: `if (errorDetails === 'manifestParsingError' || code === 204)` → return (swallows ALL)
After: `if (!isFatal && (errorDetails === 'manifestParsingError' || code === 204))` → return (only swallows non-fatal)

Fatal manifestParsingError now falls through to the fatal handler, which sets hasError=true and calls onError(). This enables the existing 10-second remount timer to fire, creating a fresh HLS.js instance that can retry loading the manifest. The cycle repeats every ~10 seconds until CF Stream's HLS pipeline produces valid segments.

verification: |

- `svelte-check`: 0 errors, 0 warnings
- `bun run build`: successful production build
- `svelte-autofixer`: 0 issues
- Awaiting user verification with live stream

files_changed:

- packages/web/src/lib/components/VideoPlayer.svelte
