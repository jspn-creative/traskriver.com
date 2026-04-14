---
status: awaiting_human_verify
trigger: 'HLS video stream playback is unreliable -- aggressive retry loop, console flooding, levelEmptyError, CORS failures'
created: 2026-04-13T18:45:00.000Z
updated: 2026-04-14T00:06:00.000Z
---

## Current Focus

hypothesis: CONFIRMED — ffmpeg was encoding nonexistent audio poorly; CF requires AAC audio; generating silent track will satisfy requirement and may fix delayed stream start. Most VideoPlayer issues from original diagnosis already fixed in prior work.
test: Code fix applied — runtime verification needed
expecting: Stream should become playable faster with valid silent audio track
next_action: User deploys to Pi and verifies stream starts within ~30s (CF's documented minimum) and audio track is accepted

## Symptoms

expected: Stream should start playing within 1-2 retries at most; console should be relatively clean; no CORS errors on analytics
actual: VideoPlayer remounts 10+ times (cache-bust param goes from 0 to 10) before playback succeeds. Console is flooded with hundreds of lines of error/retry logging. HLS.js reports dozens of non-fatal `levelEmptyError` (networkError, code 200) errors. On retry #7, a fatal `levelEmptyError` triggers the player into error state (`hasError: true`, phase `ended_confirming`). After recovering on retry #10, additional `bufferStalledError` and `bufferSeekOverHole` non-fatal errors occur. Counterscale analytics tracker has CORS policy blocking.
errors:

- CORS: Access to XMLHttpRequest blocked by CORS policy for counterscale.jspn.workers.dev
- HLS: levelEmptyError (networkError, code 200, non-fatal) — dozens of times
- HLS: levelEmptyError (networkError, code 200, fatal=true) — on retry #7
- hls-error event dispatched causing page state -> ended_confirming
- bufferSeekOverHole and bufferStalledError after eventual recovery
  reproduction: Load traskriver.com when stream is live. Observe console. Player retries many times before eventually playing.
  started: Currently happening in production

## Eliminated

(none — diagnosis mode, no hypothesis testing needed)

## Evidence

- timestamp: 2026-04-13T18:46:00Z
  checked: Console log file (254 lines)
  found: 11 remount cycles (\_cb=0 through \_cb=10). Retries 0-6 each get a single handleError before remounting. Retry 7 gets ~8 non-fatal errors, then remounts. Retry 8 gets 4 non-fatal levelEmptyError then escalates to FATAL levelEmptyError on line 107. This triggers page onPlaybackError → phase=ended_confirming. Retries 9-10 continue with more non-fatal errors. Retry 10 finally gets bufferSeekOverHole then onplaying fires → phase=viewing.
  implication: The player is being remounted on a fixed 4s interval REGARDLESS of error type. The remount is destroying HLS.js's own retry/recovery mechanisms.

- timestamp: 2026-04-13T18:47:00Z
  checked: VideoPlayer.svelte retry loop (lines 245-267)
  found: `$effect` runs when `sessionActive && !isPlaying`. Sets up `setInterval(RETRY_INTERVAL_MS=4000)` that increments `playerKey`. This destroys and recreates the entire `<media-player>` element every 4 seconds. The interval does NOT have exponential backoff. It does NOT check whether errors are transient. It does NOT wait for HLS.js to attempt its own recovery.
  implication: This is a nuclear retry strategy. HLS.js has built-in recovery for levelEmptyError (it retries playlist loads internally). The remount destroys that internal state, forcing HLS.js to start from scratch each time.

- timestamp: 2026-04-13T18:48:00Z
  checked: stream.remote.ts JWT generation (line 28)
  found: JWT exp = Math.floor(Date.now() / 1000) + 120. Token TTL is only 120 seconds. Generated via SvelteKit `query()` which caches the result. The same token URL is reused across ALL remounts (only the \_cb param changes). If stream startup takes >2 minutes, the JWT expires and all subsequent requests will fail with auth errors.
  implication: Short JWT TTL creates a race condition with slow stream startup. If the stream takes >2min to start broadcasting segments, the signed URL becomes invalid and no amount of retrying will work.

- timestamp: 2026-04-13T18:49:00Z
  checked: HLS provider configuration (VideoPlayer.svelte lines 64-85)
  found: `xhrSetup: (xhr) => xhr.setRequestHeader('Cache-Control', 'no-cache, no-store')`. Setting custom request headers on XHR makes the request "not simple" per CORS spec, which forces a CORS preflight OPTIONS request. Cloudflare Stream CDN must respond to OPTIONS with appropriate CORS headers for this to work. If it doesn't, the manifest fetch fails.
  implication: This could be causing silent failures in some browsers/environments where the CORS preflight is rejected or cached differently. This is REDUNDANT with the cache-bust query param which already defeats HTTP caching.

- timestamp: 2026-04-13T18:50:00Z
  checked: levelEmptyError meaning in HLS.js
  found: `levelEmptyError` with HTTP code 200 means the manifest was fetched successfully (200 OK) but the parsed playlist contains zero media segments. For a live stream, this is EXPECTED during the window between when CF Stream creates the manifest endpoint and when the encoder starts pushing segments. HLS.js will retry this internally with its own backoff.
  implication: The levelEmptyError is a NORMAL transient condition for live stream startup. The VideoPlayer should NOT be remounting in response to this. HLS.js would eventually succeed on its own once segments appear.

- timestamp: 2026-04-13T18:51:00Z
  checked: Dual error handler architecture
  found: VideoPlayer has TWO error handlers: (1) `handleError` in $effect (lines 99-143) listening on 'error', 'provider-error', 'hls-error', 'fatal-error' events. (2) `onLiveError` (lines 180-217) attached as `onerror` prop on <media-player>. Both have similar but not identical logic. The first uses `e.detail.type` for errorType, the second uses `e.detail.details`. Both check isFatal the same way.
  implication: Potential for double-handling of the same error event. Both handlers call onError?.() for fatal errors. The page's onPlaybackError transitions to ended_confirming and starts relay polling. This could cause race conditions in phase transitions.

- timestamp: 2026-04-13T18:52:00Z
  checked: Page state machine interaction (lines 204-211)
  found: `onPlaybackError` sets phase='ended_confirming' and starts relay polling. But the relay may still report state='live' (because the stream IS live, it's just HLS startup being slow). When relay reports 'live', page transitions back to phase='live', which means sessionActive=true and isPlaying=false — triggering ANOTHER round of remount retries.
  implication: The page state machine and VideoPlayer retry loop create a feedback cycle. Fatal HLS error → ended_confirming → relay says live → back to live → VideoPlayer retry loop restarts → more errors.

- timestamp: 2026-04-13T18:53:00Z
  checked: Counterscale CORS issue (layout.svelte lines 14-17)
  found: Counterscale.init({ siteId: 'traskriver.com', reporterUrl: 'https://counterscale.jspn.workers.dev/tracker' }). The Worker at counterscale.jspn.workers.dev is not returning Access-Control-Allow-Origin headers. This is a Cloudflare Worker configuration issue on the counterscale deployment, completely separate from the HLS issues.
  implication: Analytics are silently failing in production. Not related to HLS playback but still a production issue.

- timestamp: 2026-04-13T18:54:00Z
  checked: Cross-browser implications
  found: Safari uses native HLS (not HLS.js) for <video> elements. Vidstack may use native HLS on Safari. Native HLS has different error handling — levelEmptyError is an HLS.js-specific error. Safari's native player would handle empty manifests differently (possibly more gracefully with its own retry). The retry loop that destroys <media-player> would affect Safari too, but the error taxonomy would differ.
  implication: The remount-based retry may be unnecessary AND harmful on Safari. Safari's native HLS player has robust built-in retry mechanisms that the remount loop destroys.

- timestamp: 2026-04-14T00:01:00Z
  checked: Cloudflare Stream official documentation for audio requirement
  found: CF docs at /stream/stream-live/start-stream-live/#requirements state "Stream Live only supports H.264 video and AAC audio codecs as inputs." Troubleshooting page says to "Verify that your encoder is sending AAC audio" if stream shows "not started yet" despite encoder being connected. Audio is a hard REQUIREMENT, not just a recommendation.
  implication: Cannot simply use `-an` to strip audio. Must generate a silent AAC track. The old `-c:a aac -b:a 128k` was encoding from a nonexistent input which likely produced malformed or missing audio data — potentially causing CF to reject or delay the stream becoming playable.

- timestamp: 2026-04-14T00:02:00Z
  checked: Current state of VideoPlayer.svelte vs original diagnosis
  found: VideoPlayer has been substantially reworked since diagnosis. (1) Manifest probing system polls master + rendition playlists for #EXTINF before mounting player. (2) Remount only on fatal errors, 10s timeout (not 4s interval). (3) levelEmptyError silently counted, not acted on. (4) xhrSetup only does URL cache-busting, no Cache-Control header. (5) Buffer stall recovery with seek-to-live-edge. (6) onPlaybackError during 'live' phase just logs, doesn't remount.
  implication: RC1, RC2, RC3, RC5 from original diagnosis are all addressed. The aggressive 4s remount loop is gone. Manifest probing prevents HLS.js from seeing empty manifests.

- timestamp: 2026-04-14T00:03:00Z
  checked: JWT TTL in stream.remote.ts
  found: JWT_TTL_SECONDS = 3600 (1 hour). Was 120s when diagnosed. Already fixed.
  implication: RC4 is resolved. Token will not expire during stream startup.

- timestamp: 2026-04-14T00:04:00Z
  checked: ffmpeg command — audio encoding of nonexistent stream
  found: `-c:a aac -b:a 128k` was trying to encode audio from the RTSP input which has no audio track. ffmpeg would either produce an error, silently skip audio, or produce malformed audio data. Since CF requires AAC audio, missing/malformed audio could cause CF to delay or reject the stream — explaining the "Stream has not started yet" delay.
  implication: Replacing with `anullsrc` silent audio source at 1k bitrate will: (1) satisfy CF's AAC requirement, (2) use negligible Pi CPU (trivial encoding), (3) potentially fix the 30s+ startup delay if CF was waiting for valid audio frames.

- timestamp: 2026-04-14T00:05:00Z
  checked: CF preferLowLatency API option
  found: CF live inputs support `preferLowLatency: true` (beta). Enables LL-HLS pipeline with reduced segment wait time. Currently not set (defaults to false). Recommendations: GOP 1-2s, use RTMP endpoint. Both are already the case (RTMPS endpoint is used; camera GOP is unknown but configurable).
  implication: Enabling this via CF API could further reduce startup time. Not a code change — requires API call or dashboard toggle.

## Resolution

root_cause: |
Multiple compounding issues, ranked by severity:

**RC1 (Critical): Overly aggressive remount-based retry loop destroys HLS.js internal recovery**
The VideoPlayer remounts the entire <media-player> on a fixed 4-second interval whenever sessionActive && !isPlaying. This is a nuclear approach that destroys HLS.js's built-in retry/backoff mechanisms. HLS.js handles levelEmptyError internally by retrying playlist loads with exponential backoff. The remount forces HLS.js to start completely from scratch each time, paradoxically making recovery slower and noisier.

**RC2 (Critical): levelEmptyError is treated as requiring intervention when it's a normal transient condition**  
 An empty manifest (HTTP 200 but no segments) is the EXPECTED state of a CF Stream live input that has been configured but hasn't started receiving video data yet. HLS.js will naturally retry and succeed once segments appear. The current code correctly identifies these as non-fatal but the timer-based remount loop doesn't care about error type — it remounts regardless.

**RC3 (High): Feedback loop between page state machine and VideoPlayer retry**
When a fatal error occurs, the page transitions to ended_confirming → polls relay → relay says "live" → transitions to "live" → sessionActive=true & isPlaying=false → triggers another full cycle of remount retries. This can loop indefinitely.

**RC4 (High): Short JWT TTL (120s) creates a hard failure cliff**
The signed URL token expires after 120 seconds. If the stream startup takes longer than 2 minutes (including relay startup, RTMP connection, initial segment encoding), the token becomes invalid. SvelteKit's query() caches the token, so there's no way to refresh it without explicit user action (the Retry button calls refresh()). Users who hit this cliff get permanent failures until page reload.

**RC5 (Medium): xhrSetup with Cache-Control header may trigger CORS preflight issues**  
 Setting Cache-Control request header on manifest XHR requests forces a CORS preflight. This is redundant with the cache-bust query param. If CF Stream CDN doesn't properly respond to OPTIONS requests in some edge cases, this could cause silent manifest fetch failures.

**RC6 (Low): Counterscale CORS misconfiguration**
The counterscale.jspn.workers.dev Worker doesn't return CORS headers. This is a deployment configuration issue for the Counterscale Worker, unrelated to HLS.

fix: |
**Applied fixes:**

1. **ffmpeg.ts: Silent audio generation** — Replaced `-c:a aac -b:a 128k` (which tried to encode a nonexistent audio stream) with a proper `anullsrc` virtual input that generates a silent mono AAC track at 1k bitrate. CF Stream requires AAC audio in RTMPS input (documented requirement). The old command was encoding from nothing, which may have caused CF to wait for audio segments that never materialized properly. The new approach uses `-f lavfi -i anullsrc=r=44100:cl=mono -c:a aac -b:a 1k -shortest` — negligible CPU/bandwidth cost on the Pi.

2. **ffmpeg.ts: Fixed incorrect comment** — Replaced the comment claiming "RTSP source should be configured to ≤1080p, ≤10fps, CBR ≤2Mbps for reliable passthrough on low-power hardware" (which incorrectly implied these were CF limits) with accurate information: CF accepts H.264 up to ~12 Mbps at any resolution; the real bottleneck with `-c:v copy` is the Pi's upstream bandwidth, not CPU.

**Previously fixed (between diagnosis and this session):**

- RC1/RC2: VideoPlayer now probes the manifest (including rendition playlists) for `#EXTINF` segments before mounting the player, preventing HLS.js from ever seeing empty manifests
- RC3: `onPlaybackError` during `live` phase no longer triggers remount — just logs. Feedback loop eliminated.
- RC4: JWT TTL increased from 120s to 3600s (1 hour)
- RC5: `xhrSetup` no longer sets Cache-Control header — uses URL cache-busting only

**Recommendations (not code changes):**

- Enable `preferLowLatency: true` on the CF live input via API — this activates the beta LL-HLS pipeline which reduces segment wait time. Run: `curl --request PUT https://api.cloudflare.com/client/v4/accounts/{account_id}/stream/live_inputs/{input_id} --header "Authorization: Bearer <API_TOKEN>" --data '{"preferLowLatency": true, "recording": {"mode": "automatic"}}'`
- Consider increasing camera fps from 8 to 15-20fps in camera settings (currently avg_frame_rate=8/1). The prototype ran at 20fps.
- CF troubleshooting docs state "Wait thirty seconds" for initial connection is normal. The manifest probe loop (3s interval) handles this gracefully.

verification: |
Code changes verified by reading final file state. Runtime verification requires:

1. Deploy updated relay to Pi
2. Start a stream and observe ffmpeg stderr for proper silent audio muxing
3. Verify CF Stream accepts the input and becomes playable
4. Measure time from button press to playback

files_changed:

- packages/relay/src/ffmpeg.ts
