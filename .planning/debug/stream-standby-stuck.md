---
status: awaiting_human_verify
trigger: 'Web UI stuck on "connecting" with streamStandby: true even though relay reports shouldStream=true and is live'
created: 2026-04-13T22:00:00.000Z
updated: 2026-04-13T23:00:00.000Z
---

## Current Focus

hypothesis: CONFIRMED — Three compounding root causes: (1) VideoPlayer mounts too early (during 'starting' phase), hammering empty manifests for the entire relay startup + CF Stream processing time; (2) No cache-busting on m3u8 XHR requests, so browser caches empty 200 responses; (3) After eventual playback, no live-edge seek, so video appears frozen on stale buffer. Also: streamStandby was a dead variable (never read).
test: Build passes, svelte-check clean, fix applied
expecting: Faster stream startup (player only loads when relay reports 'live'), cache-busted manifests converge faster, live-edge seek prevents frozen video
next_action: User verifies in production with live stream

## Symptoms

expected: When the relay is live and shouldStream=true, the UI should transition from "connecting" to showing and playing the video stream automatically.
actual: UI stays stuck showing "connecting" with state demandRegistered=true, lastKnownRelayState="live", phase="live", relayStale=false, sessionActive=true, streamError=false, streamStandby=true. Relay log shows `poll: shouldStream=true, ttl=199s`. "[VideoPlayer] empty manifest — HLS.js will retry" errors flood console 3 at a time. After ~200 retries, streamStandby becomes false but video appears frozen.
errors: |

- streamStandby remains true for ~200 retry cycles when it should transition to false quickly
- "[VideoPlayer] empty manifest — HLS.js will retry" errors (3 at a time, ~200 iterations before success)
- Even after streamStandby becomes false, video appears frozen/not playing
  reproduction: Load traskriver.com when stream is live. UI shows "connecting" and stays there for minutes. Consistent in Chromium-based browsers. Works in Safari (native HLS). After ~200 empty manifest retries, standby clears but video is frozen.
  timeline: Has always been intermittent/finnicky, but now consistently broken in Chromium. Safari with native HLS tends to work.

## Eliminated

- hypothesis: streamStandby variable is causing the stuck state
  evidence: streamStandby is never read in any conditional logic, template binding, or derived state. It is only written and logged. The "Connecting" label comes from `phase === 'live'`, not streamStandby.
  timestamp: 2026-04-13T22:01:00Z

- hypothesis: HLS.js provider config is applied after construction (config timing race)
  evidence: Traced vidstack 0.6.15 source: provider-change event fires from SourceSelection.render() BEFORE reactive effect Me() calls provider.setup(). The config set in the provider-change handler IS read by the HLS.js constructor. Config timing is correct.
  timestamp: 2026-04-13T22:20:00Z

## Evidence

- timestamp: 2026-04-13T22:01:00Z
  checked: All references to streamStandby in +page.svelte
  found: streamStandby is declared at line 21, set false in onPlaybackStart (line 196), set true in registerDemand (line 222) and restartStream (line 239), and logged in debug $effect (line 254). It is NEVER READ in any conditional, template binding, class, or derived state.
  implication: streamStandby is a dead variable with zero functional impact. Removed in fix.

- timestamp: 2026-04-13T22:02:00Z
  checked: What determines "Connecting" UI label
  found: Lines 417-418 show `phase === 'live' ? 'Connecting'`. Phase transitions to 'live' when relay reports state='live'. Exits 'live' only when onPlaybackStart fires (→ 'viewing').
  implication: UI is correctly waiting for HLS.js to fire onplaying. The bug is that HLS.js never successfully starts playback in time.

- timestamp: 2026-04-13T22:03:00Z
  checked: "3 at a time" error pattern
  found: CF Stream live inputs produce 3 quality renditions in the master manifest. When each variant playlist is empty (no segments yet), HLS.js fires levelEmptyError for each. 3 renditions × 1 retry cycle = 3 errors per cycle.
  implication: Explains the "3 at a time" pattern perfectly. Not multiple HLS instances — it's 3 renditions per retry.

- timestamp: 2026-04-13T22:04:00Z
  checked: Prior fixes from hls-playback-reliability.md
  found: RC1 (aggressive remount loop) FIXED — now only 10s timeout on fatal error. RC2 (levelEmptyError handling) FIXED — explicitly caught and ignored. RC4 (short JWT) FIXED — TTL now 3600s. RC5 (Cache-Control header causing CORS preflight) FIXED — xhrSetup removed entirely. But the removal of xhrSetup ALSO removed all cache-busting.
  implication: The prior fix for RC5 created a new problem — without any cache-busting, empty variant playlist 200 responses may be cached by the browser.

- timestamp: 2026-04-13T22:10:00Z
  checked: When VideoPlayer mounts relative to stream lifecycle
  found: VideoPlayer mounts as soon as demandRegistered=true (line 269: `{#if demandRegistered}`). This is during the 'starting' phase — the relay hasn't even transitioned to 'live' yet. CF Stream hasn't received RTMP data yet. The manifest URL exists but returns empty variant playlists. HLS.js starts hammering these empty endpoints immediately.
  implication: VideoPlayer starts loading 30-60+ seconds too early. All retries during the relay startup phase are wasted — segments won't exist until the relay is live AND CF Stream processes the first RTMP data into HLS segments.

- timestamp: 2026-04-13T22:15:00Z
  checked: HLS.js retry math for ~200 errors
  found: With 3 renditions, ~200 errors ÷ 3 = ~67 retry attempts. HLS.js default levelLoadingMaxRetry=4 with exponential backoff → each cycle takes ~15-20s before escalating to fatal. Vidstack's error handler calls startLoad() on fatal network error → restart cycle. ~17 restart cycles × ~15s = ~4.5 minutes, matching user's observed delay.
  implication: The retry loop is working correctly but converges slowly. Eliminating the wasted startup-phase retries removes the largest contributor.

- timestamp: 2026-04-13T22:20:00Z
  checked: Vidstack HLS provider config timing
  found: Traced full sequence: SourceSelection.render() → loader.load().then() → dispatches provider-change DOM event → VideoPlayer handler sets provider.config → signal updates → Me() effect runs → provider.setup() → HLSLibLoader loads HLS.js → new Hls({...this.nh}) reads updated config. Config timing is correct.
  implication: Eliminated config timing as a root cause.

- timestamp: 2026-04-13T22:25:00Z
  checked: Frozen video after eventual playback
  found: After HLS.js finally loads segments and fires onplaying, the player may be playing from a stale live position. With many recovery cycles, the HLS.js internal live sync position may be off. No explicit live-edge seek occurs after playback starts. The video appears "frozen" because it's playing old buffer data that isn't advancing with new segments.
  implication: Need to seek to live edge (video.currentTime = video.duration) when onplaying fires for a live stream. This ensures the viewer starts at the current live position.

- timestamp: 2026-04-13T22:30:00Z
  checked: xhrSetup cache-busting approach (URL param vs header)
  found: The old xhrSetup set Cache-Control request header → triggered CORS preflight → was correctly removed. A URL query param (\_cb=timestamp) does NOT trigger CORS preflight (it's still a "simple" request). HLS.js's xhrSetup callback receives (xhr, url) — calling xhr.open('GET', modifiedUrl, true) re-opens the request with the cache-busted URL. Only m3u8 files need cache-busting (not .ts media segments).
  implication: URL-based cache-busting solves the stale-response problem without reintroducing CORS preflight.

## Resolution

root_cause: |
Three compounding root causes:

**RC1 (Critical): VideoPlayer mounts too early, hammering empty manifests for entire relay startup**
The VideoPlayer renders as soon as `demandRegistered=true`, which is during the 'starting' phase. At this point the relay hasn't even connected to CF Stream. HLS.js immediately starts fetching the manifest URL and gets empty variant playlists. All retries during the 30-60+ second relay startup window are wasted. With 3 renditions, HLS.js's retry/recovery loop generates ~200 levelEmptyError events before segments finally appear.

**RC2 (High): No cache-busting on m3u8 XHR requests after prior CORS fix**
The prior fix correctly removed the Cache-Control request header (which triggered CORS preflight), but also removed all cache-busting. Without it, the browser may cache empty 200 responses from CF Stream's CDN, causing HLS.js retries to receive stale empty manifests even after segments become available.

**RC3 (Medium): No live-edge seek after playback starts → frozen video**
After the HLS.js instance finally succeeds (segments available), the onplaying event fires. But the player may be at a stale buffer position from prior recovery cycles. Without an explicit seek to the live edge, the video appears frozen or playing from an old position.

**Also:** streamStandby was a dead variable (declared, written to, logged — but never read in any conditional or template).

fix: |

1. **Defer VideoPlayer mount until phase='live'** (+page.svelte): Added `showPlayer` derived that's true only for 'live', 'viewing', 'ended_confirming' phases. VideoPlayer only renders when `showPlayer` is true. During 'starting'/'unavailable' phases, a poster image is shown instead. The `svelte:boundary` with `await getStreamInfo()` still resolves during 'starting' (pre-fetching the JWT) — the VideoPlayer just doesn't mount yet.

2. **Cache-bust m3u8 requests via URL query param** (VideoPlayer.svelte): Added `xhrSetup` to HLS.js config that appends `_cb=<timestamp>` to m3u8 URLs. Uses URL query param (not request header) so no CORS preflight is triggered. Only targets playlist files, not media segments.

3. **Seek to live edge on playback start** (VideoPlayer.svelte): In `onLivePlaying()`, after detecting playback, seeks to `video.duration` (live edge for live streams) to ensure viewer starts at current position, not stale buffer.

4. **Removed dead streamStandby variable** (+page.svelte): Removed declaration, all writes, and debug logging reference. Replaced with `showPlayer` in debug log.

verification: |

- `bunx svelte-check`: 0 errors, 0 warnings
- `bun run build`: successful production build
- Awaiting user verification with live stream in Chromium browser

files_changed:

- packages/web/src/routes/+page.svelte
- packages/web/src/lib/components/VideoPlayer.svelte
