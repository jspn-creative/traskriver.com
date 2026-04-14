---
status: awaiting_investigation
trigger: 'Relay streaming pipeline unreliable — stream buffers/freezes after ~5s. Pi 3 cannot process main RTSP stream fast enough. Previously worked under same conditions.'
created: 2026-04-13T00:00:00Z
updated: 2026-04-14T00:00:00Z
---

## Current Focus

hypothesis: The Pi 3's RTSP→FLV mux throughput is the bottleneck. At 2304x1296/8fps/2Mbps CBR, ffmpeg runs at ~0.9-1.1x speed — marginally real-time. This causes RTSP buffer overflows, corrupt/missing frames in the FLV output, and HLS.js buffer stalls in the browser. Switching to UDP transport or further reducing camera settings may provide enough headroom.
test: Test UDP transport, lower bitrate, and/or investigate why it previously worked
expecting: Either UDP transport provides enough throughput improvement, or we find evidence of what changed since it last worked
next_action: Test `-rtsp_transport udp`, check camera firmware version, check ffmpeg version, try 1Mbps CBR

## Symptoms

expected: User presses "Start Stream" → stream starts within ~5 seconds → video plays smoothly and stays playing.
actual: Stream starts after 10-40s of manifest probing (204s from CF Stream), plays for ~5 seconds, then freezes with repeated bufferStalledError / bufferSeekOverHole / bufferNudgeOnStall. Badge now correctly shows "Buffering" but stream never recovers to sustained playback.
errors: |
  Browser console (typical cycle):
  - [VideoPlayer] non-fatal HLS error: bufferSeekOverHole
  - [VideoPlayer] non-fatal HLS error: bufferStalledError (×1)
  - [VideoPlayer] non-fatal HLS error: bufferNudgeOnStall
  - [VideoPlayer] buffer stalled — seeking to live edge {stalls: 2}
  - [VideoPlayer] waiting (buffering)
  Relay stderr:
  - [rtsp] CSeq 6 expected, 0 received (RTSP sequence number mismatch — packet loss)
  - [h264] concealing 16000-18000+ DC/AC/MV errors in P/I frames (at 2560x1920/20fps)
  - corrupt decoded frame (when re-encoding)
reproduction: Click "Start Stream" in any browser on traskriver.com (dev or prod). Stream starts, plays 3-5 seconds, freezes.
timeline: |
  - Originally worked during prototyping (~March 2026) with same hardware/camera — fast startup, stable playback.
  - Progressively degraded over multiple debug sessions (April 2026).
  - Sub-stream (640x480/10fps) works perfectly — proves full pipeline is functional.
  - Main stream at every tested resolution/framerate fails on Pi 3.

## CRITICAL OPEN QUESTION: Why Did It Previously Work?

The user is emphatic that this exact pipeline (same Pi 3, same camera, same CF Stream config) worked reliably during prototyping. The stream started in ~5 seconds and played smoothly. This was before signed URLs were implemented. Possible explanations to investigate:

1. **Camera firmware update** — may have changed encoding behavior (bitrate patterns, keyframe structure). Check firmware version.
2. **Network conditions** — Pi 3 may have been on a different network segment or had less contention with the camera. CSeq errors suggest network-layer issues.
3. **CF Stream backend change** — CF may have tightened ingest tolerance for high-resolution or irregular-timestamp streams.
4. **Camera was encoding at lower effective bitrate** — even at same resolution, nighttime/low-motion scenes produce much less data than daytime. If prototyping was done at night or with a static scene, the actual bitrate may have been 500kbps vs the current 2Mbps.
5. **Signed URLs changed manifest URL structure** — pre-signed-URL setup used unsigned manifest URLs which may have different CDN caching/delivery behavior.
6. **ffmpeg version difference** — if the Pi's ffmpeg was updated, RTSP demuxing behavior may have changed.
7. **RTSP transport mode** — original prototype may have used UDP (default) instead of TCP. UDP has lower overhead but drops packets silently; TCP retries and causes backpressure on a slow reader.
8. **Camera settings were different** — the camera may have been at a lower resolution, lower framerate, or lower bitrate during prototyping and was later changed.

## Root Causes Found

### RC1: CF Stream silently disconnects high-resolution RTMP inputs (CONFIRMED)
- CF Stream API showed `client_disconnect` after ~100 seconds when receiving 2560x1920 video via `-c:v copy` passthrough.
- ffmpeg kept running (didn't detect disconnect), relay kept reporting "live", frontend got 204 forever.
- At 2304x1296/10fps with the improved ffmpeg flags, CF Stream stays connected (tested 40+ seconds).
- At 640x480 (sub-stream), CF Stream stays connected indefinitely.
- **Conclusion:** Resolution alone isn't the issue (2304x1296 > 1080p and CF accepts it). The disconnect was likely caused by irregular timestamps or corrupt frames from the Pi 3 falling behind.

### RC2: Pi 3 cannot process main RTSP stream at real-time speed (CONFIRMED)
- Even with `-c:v copy` (no re-encoding), ffmpeg muxing speed on Pi 3:
  - 2560x1920/20fps: **0.5x** (completely unusable)
  - 2304x1296/10fps: **0.9-1.1x** (marginal, frequent stalls)
  - 2304x1296/8fps: still causes browser buffer stalls
  - 640x480/10fps (sub-stream): **3x+** (perfectly stable)
- Re-encoding (libx264 ultrafast or h264_v4l2m2m) makes it worse: 0.3x speed.
- The RTSP demux + FLV mux overhead is the bottleneck, not encode.
- CSeq errors (`CSeq 6 expected, 0 received`) appear when the Pi falls behind — RTSP protocol-level desync from buffer overflow.

### RC3: Zero production logging (FIXED)
All console output was behind `__DEV__`. Production was completely blind.

### RC4: Button/badge showed wrong states (FIXED)
- Button showed "Streaming" (green) at phase='live' instead of phase='viewing'.
- Badge now shows "Buffering" (amber) when `streamBuffering` is true.

### RC5: No buffer stall recovery (FIXED)
- `bufferStalledError` was silently ignored — video froze forever.
- Now seeks to live edge after 2 consecutive stalls (15s cooldown).

## Hardware Constraint

**Raspberry Pi 3 Model B Rev 1.2**
- 4x ARM Cortex-A53 @ 1.2GHz
- 906MB RAM
- No usable hardware H.264 decode acceleration in ffmpeg
- h264_v4l2m2m encoder available but decode is still software — same bottleneck
- During main stream encoding: 194% CPU (2 of 4 cores), 259MB RAM

## Camera Settings (Reolink)

- Main stream: minimum 2304x1296, currently 8fps, ~2Mbps CBR, constant framerate, H.264
- Sub-stream: 640x480, 10fps (cannot increase resolution)
- H.265 NOT viable for live streaming — RTMP/FLV only supports H.264
- Adjustable: frame rate (min unknown), max bitrate, I-frame interval, bitrate mode (VBR/CBR), frame rate mode (auto/constant)

## Fixes Applied

### Commit: e3dff71
- Production logging in VideoPlayer.svelte and +page.svelte
- Button states corrected (green only when video playing)
- Error boundary z-index fix
- Removed automatic demand heartbeat (demand is intentionally manual)

### Commit: 9db612e
- Relay ffmpeg health monitor (kills stalled processes after 30s stderr silence)
- `-fflags +genpts` for proper timestamps
- `-c:v copy` passthrough mode
- VideoPlayer buffer stall recovery (seek to live edge after 2 stalls)
- Media lifecycle event listeners (canplay, waiting, stalled, error) for Safari/native HLS
- Production logging for manifest probe states (204, non-M3U, no segments)

### Uncommitted changes (in working tree)
- **Relay ffmpeg.ts:** `-use_wallclock_as_timestamps 1`, `-fflags +genpts+discardcorrupt`, `-buffer_size 4194304` (4MB RTSP receive buffer)
- **+page.svelte:** `streamBuffering` state, badge shows "Buffering" (amber) during stalls, `onBuffering` callback
- **VideoPlayer.svelte:** `onBuffering` prop wired to waiting/canplay/stalled/playing events
- **Pi .env:** RTSP URL pointing to main stream (h264Preview_01_main), RELAY_FFMPEG_VERBOSE=1

### Deployed to Pi (matches uncommitted relay changes)
- ffmpeg args updated with wallclock timestamps, discardcorrupt, 4MB buffer
- RTSP URL = main stream

## Eliminated Hypotheses

- JWT caching/expiration: JWT TTL is 3600s, query() caching works correctly
- VideoPlayer state not resetting: component unmount/remount creates fresh state
- CF Stream resolution hard limit: 2304x1296 accepted (stays connected with clean input)
- Hardware video encode: h264_v4l2m2m tested, same bottleneck (decode is software)

## Next Steps (for fresh context)

1. **Test UDP transport:** `-rtsp_transport udp` instead of tcp — lower overhead, may allow real-time throughput
   ```
   ssh pi@relay.tail0489de.ts.net
   timeout 30 ffmpeg -y -use_wallclock_as_timestamps 1 -fflags +genpts+discardcorrupt \
     -rtsp_transport udp -buffer_size 4194304 \
     -i 'rtsp://spinney:aj576LH1*@192.168.68.50:554/h264Preview_01_main' \
     -c:v copy -c:a aac -b:a 128k -f flv -t 20 /tmp/test_udp.flv 2>&1 | grep -E 'frame=|speed='
   ```
   If speed stays above 1.5x, update ffmpeg.ts and test end-to-end.

2. **Lower camera bitrate:** Try 1Mbps CBR at 8fps — reduces RTSP data volume by half.

3. **Check what changed since prototyping:**
   - `ssh pi@relay.tail0489de.ts.net "ffmpeg -version"` — compare with any records
   - Check camera firmware version via its web UI (192.168.68.50)
   - Check git history for any ffmpeg arg changes: `git log --all --oneline -- packages/relay/src/ffmpeg.ts`

4. **If UDP works:** Update ffmpeg.ts, deploy, test in browser, commit.

5. **If nothing works at main stream resolution:** Fall back to sub-stream, document as Pi 3 hardware limitation, recommend Pi 4/5 upgrade.

## Key Files

- `packages/relay/src/ffmpeg.ts` — ffmpeg spawn args and health monitor
- `packages/relay/src/index.ts` — relay state machine and tick loop
- `packages/web/src/lib/components/VideoPlayer.svelte` — HLS player, manifest probe, error handling
- `packages/web/src/routes/+page.svelte` — page state machine, badge, button
- `packages/web/src/routes/stream.remote.ts` — CF Stream JWT generation
- Pi relay env: `/opt/river-relay/.env` (SSH: `pi@relay.tail0489de.ts.net`)
- Pi relay service: `sudo systemctl restart river-relay`
- CF Stream API token: in this session's history (has edit access)
- CF account ID: `e1c1047c245641f3c40cb70ea0d8f7c6`
- CF Stream live input UID: `366e1176c50def57805b764ff5512991`
