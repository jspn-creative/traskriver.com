---
status: investigating
trigger: "Stream stuck at 'Starting' despite relay being live — phase never transitions from starting to live/viewing"
created: 2026-04-08T00:00:00Z
updated: 2026-04-09T02:00:00Z
---

## Current Focus

hypothesis: CF Stream returns 204 indefinitely because the live input UID encoded in the JWT (`sub` claim, from `CF_STREAM_LIVE_INPUT_UID`) does not match the live input that ffmpeg is actively streaming to. The relay's `STREAM_URL` contains the RTMPS **streaming key** for the live input; the HLS URL uses the live input **UID**. If these two env vars were populated from different live inputs (or one is wrong), ffmpeg pushes to input A while the HLS URL points at input B, which has no active broadcast → CF Stream returns 204 forever.
test: Add `liveSrc` logging in VideoPlayer.svelte so the full signed HLS URL appears in the browser console. User can then (1) decode the JWT `sub` to see the UID, (2) curl the manifest to confirm 204, and (3) compare the UID against the live input in the Cloudflare dashboard.
expecting: The logged URL will reveal whether the customer code and UID are plausibly correct, or will expose an obviously wrong value (wrong length, placeholder text, mismatched UUID format).
next_action: Add liveSrc diagnostic log to VideoPlayer.svelte; provide user with curl + JWT decode instructions to verify the URL

## Symptoms

expected: Click "Start Stream" → status shows "Starting" → relay goes live → status shows "Live" (phase=live) → video plays → status shows "Live" with green dot (phase=viewing)
actual: Click "Start Stream" → status shows "Starting" → stays at "Starting" forever. Video never plays. Relay IS live (`curl` confirms `{"state":"live","stale":false}`)
errors: "manifestParsingError, code: 204" (every remount cycle, forever — isOffline: true, isFatal: true)
reproduction: 1. Go to https://stream.jspn.workers.dev 2. Click start stream button 3. Observe status stuck at "Starting" 4. Relay confirmed live via curl
started: After JWT signing was added; relay heartbeat was recently added; worker was redeployed

## Eliminated

- hypothesis: player.play() retry loop would recover playback after 204 manifestParsingError
  evidence: vidstack rejects play() with "media is not ready - wait for can-play event" when HLS.js has stopped loading; can-play never fires after a fatal 204 error
  timestamp: 2026-04-09T00:00:00Z

- hypothesis: {#key playerKey} TypeErrors on cleanup preventing clean remounts
  evidence: Checkpoint 2 confirms "TypeErrors are gone — remount loop is clean." The fixes (capture el = player, remove explicit player = undefined) resolved the TypeError. Loop now cycles cleanly but 204 persists.
  timestamp: 2026-04-09T02:00:00Z

- hypothesis: Phase stuck at `starting` (never reaches `live`)
  evidence: Checkpoint 2 console shows `{phase: 'live', sessionActive: true, streamStandby: true}` — phase transitions correctly. The "Starting" display is the badge text; it now says "Connecting" for live phase (already fixed in badge).
  timestamp: 2026-04-09T02:00:00Z

- hypothesis: Relay heartbeat exhausting KV free tier (earlier root cause)
  evidence: Fixed — heartbeat rate-limited to 60s minimum. Not relevant to current 204 issue.
  timestamp: 2026-04-09T02:00:00Z

## Evidence

- timestamp: 2026-04-09T00:00:00Z
  checked: Checkpoint response — behaviour of retry loop in the wild
  found: (1) Phase transitions unavailable→starting correctly. (2) "Configuring HLS provider" fires. (3) manifestParsingError code 204 fires — HLS.js stops loading after the 204. (4) Retry loop fires "attempting to play (retry loop)". (5) BUT every player.play() call throws "[vidstack] media is not ready - wait for can-play event". (6) streamStandby stays true indefinitely.
  implication: The retry loop is calling player.play() but vidstack rejects it because can-play has never fired. can-play never fires because HLS.js stopped loading after the 204 fatal error. Calling play() on a stopped HLS.js instance is the wrong API surface. The fix must restart the HLS.js loading process itself, not call play().

- timestamp: 2026-04-09T00:01:00Z
  checked: HLS.js recovery semantics after manifestParsingError (fatal)
  found: A 204 response to the manifest URL causes HLS.js to fire MANIFEST_PARSING_ERROR with fatal:true. After a fatal error HLS.js stops all loading. The only ways to restart are: (a) call hls.loadSource(url) on the HLS.js instance, (b) destroy + recreate the HLS instance, (c) destroy + recreate the entire media-player element. Our error handlers swallow the error (correct — no error UI) but never invoke any recovery path.
  implication: player.play() can never succeed while HLS.js is stopped. We must restart HLS.js. The cleanest Svelte-idiomatic way is to use {#key playerKey} on <media-player>: incrementing playerKey destroys the old element (and its stopped HLS.js instance) and mounts a fresh one. The new element's autoplay attribute handles calling play() once the manifest eventually loads.

- timestamp: 2026-04-08T00:01:00Z
  checked: Status badge text in +page.svelte lines 396-406
  found: The badge shows "Starting" for BOTH `phase === 'starting'` AND `phase === 'live'`. The ternary at line 402 is `phase === 'starting' || phase === 'live' ? 'Starting'`. So user seeing "Starting" does NOT distinguish between these two phases.
  implication: We CANNOT determine from the user symptom alone whether `phase` is stuck at `starting` or has progressed to `live`. Need console logs or code analysis to determine.

- timestamp: 2026-04-08T00:02:00Z
  checked: Phase transition logic in pollRelayStatus() — lines 131-141
  found: Transition from `starting` → `live` requires: (1) `phase === 'starting' || phase === 'unavailable'`, (2) `data.state === 'live'`, (3) `data.stale === false` (because stale check on line 108 returns early). Since `curl` confirms `{"state":"live","stale":false}`, this transition SHOULD fire. The `polling` flag is set to `true` in `registerDemand()` at line 213. The `$effect` at line 162 starts polling when `polling` is true.
  implication: The `starting` → `live` transition should work given the API response. Likely `phase` DOES reach `live`.

- timestamp: 2026-04-08T00:03:00Z
  checked: VideoPlayer sessionActive prop and play trigger — VideoPlayer.svelte lines 188-200
  found: The `$effect` at line 188 triggers `player.play()` when `sessionActive && player && typeof player.play === 'function' && !isPlaying`. During `starting` phase, `sessionActive` is already `true` (line 69: `phase !== 'idle' && phase !== 'ended' && phase !== 'error'`). So the play attempt should happen as soon as VideoPlayer mounts (after `await getStreamInfo()` resolves).
  implication: Play is attempted during `starting` phase, not just `live`. If HLS manifest returns 204 (no broadcast yet), this is expected to fail silently via the manifestParsingError handler.

- timestamp: 2026-04-08T00:04:00Z
  checked: VideoPlayer src binding — line 211 of VideoPlayer.svelte
  found: `src={liveSrc}` is set once when VideoPlayer mounts. The `liveSrc` comes from `stream.liveHlsUrl` which is a JWT-signed URL with 1-hour expiry. The signed URL is generated server-side via `query()` (SvelteKit's `$app/server` query function). This URL is computed ONCE when `getStreamInfo()` resolves. If the JWT token is valid and the HLS endpoint responds correctly, this should work. BUT — the token is generated with `exp: Math.floor(Date.now() / 1000) + 3600` using the SERVER's clock. If Worker clock differs significantly, token could be expired on arrival.
  implication: JWT token validity is a potential issue but unlikely (Workers use accurate NTP-synced clocks).

- timestamp: 2026-04-08T00:05:00Z
  checked: How VideoPlayer fires onPlaying (the trigger for phase=viewing)
  found: `onPlaying` is bound to `onLivePlaying` (line 138-143) which is called from the `onplaying` DOM event on `<media-player>` (line 218). This requires the HLS video to actually start playing. The `onplaying` event only fires when media playback begins. If HLS never loads a valid manifest → no segments → no playback → no `onplaying` → stuck at whatever phase is current.
  implication: If HLS manifest returns 204 or the signed URL is invalid, video will NEVER play, and phase will never reach `viewing`.

- timestamp: 2026-04-08T00:06:00Z
  checked: Overlay behavior during `live` phase — lines 308-340
  found: The "Starting stream..." overlay at z-30 is shown ONLY for `phase === 'starting'` (line 308). There is NO overlay for `phase === 'live'`. So when phase transitions to `live`, the text overlay disappears. The blur overlay (lines 292-296) has `sessionActive ? 'pointer-events-none opacity-0' : ''` — since `sessionActive` is true during both `starting` and `live`, the blur is opacity-0 from the start.
  implication: If phase reaches `live`, the "Starting stream..." text should disappear. If user STILL sees "Starting stream..." text, phase is stuck at `starting`, not `live`. But user might be referring to the badge text "Starting" which shows for both phases.

- timestamp: 2026-04-08T00:07:00Z
  checked: Polling stop behavior — does polling stop when phase transitions to `live`?
  found: In `pollRelayStatus()` line 132-134, when `data.state === 'live'`, it sets `phase = 'live'` but does NOT set `polling = false`. Polling is only stopped on: (1) `phase = 'ended'` (lines 113-114, 139-140), (2) `phase = 'error'` (line 103), (3) `phase = 'viewing'` via `onPlaybackStart()` (line 184). So polling CONTINUES during `live` phase. This is intentional — it keeps polling to detect if relay stops.
  implication: Polling continues during `live`, which is correct behavior.

- timestamp: 2026-04-08T00:09:00Z
  checked: KV write rate from relay heartbeat — packages/relay/src/index.ts line 114 (prior to fix)
  found: A `reporter.report(state)` call was placed unconditionally on every tick (every `pollIntervalMs`, default 10s). Each call POSTs to the Worker, which does a `kv.put()`. Rate: 6 writes/min × 60 × 24 = 8,640 KV puts/day. Cloudflare Workers KV free tier limit is 1,000 puts/day. The relay exhausts the daily limit in ~2.8 hours of running.
  implication: CRITICAL — this is the cause of the 429 errors. The heartbeat was added to prevent the 120s KV TTL from expiring during stable states, but fires far too frequently.

- timestamp: 2026-04-09T01:00:00Z
  checked: Checkpoint human-verify response — browser console with live relay test
  found: (1) manifestParsingError code 204 fires as expected. (2) "remounting player (retry)" fires. (3) TypeError: null is not an object (evaluating removeEventListener) — repeating every cycle. (4) phase=starting → phase=live transitions correctly. (5) Remounting continues after phase=live. (6) TypeError in cleanup too. Root: both $effect cleanups read the reactive `player` signal (already null after {#key} destroys the element) rather than a captured element reference. Compounded by explicit `player = undefined` being set before `playerKey += 1` in the retry interval, triggering the cleanup immediately with player already null on every cycle.
  implication: The TypeErrors interrupt Svelte's reconciliation on every remount cycle, preventing the new element from mounting cleanly and firing autoplay. All three bugs must be fixed simultaneously: capture `el = player` in both effects, remove explicit `player = undefined`, fix broken indentation in both error handlers.

- timestamp: 2026-04-08T00:08:00Z
  checked: The `manifestParsingError` / 204 error handling in VideoPlayer
  found: Both `handleError` (line 70-108) and `onLiveError` (line 145-174) check for manifestParsingError/204 and silently return without calling `onError()`. This means if CF Stream returns 204, the error is swallowed and the player stays in a non-playing state. The `sessionActive` effect (line 188-200) would retry `player.play()` whenever `sessionActive` changes (it's reactive on `sessionActive`, `player`, and `isPlaying`). BUT — `sessionActive` doesn't change between `starting` and `live` (both are true). And `player` reference doesn't change. And `isPlaying` stays false. So the effect runs ONCE and doesn't re-run.
  implication: CRITICAL — After the initial `player.play()` fails with 204/manifestParsingError, there is NO retry mechanism. The `$effect` at line 188 only re-runs when its reactive dependencies change, and none of them change after the initial call. The video player is stuck in a dead state.

- timestamp: 2026-04-09T02:00:00Z
  checked: Checkpoint 2 response — TypeErrors gone, 204 persists indefinitely
  found: (1) Remount loop is clean (no TypeErrors). (2) Phase correctly transitions starting→live. (3) Every remount immediately gets 204 manifestParsingError. (4) Relay has been live "several minutes" — CF Stream still 204. (5) `isOffline: true` every cycle. Relay confirms live (`STATE: starting → live`, `status reported: live`) — but relay liveness is determined purely by ffmpeg process still running, NOT by CF Stream confirming RTMP ingest.
  implication: CF Stream is not ingesting the RTMP stream from the relay, OR the HLS URL encodes a different live input UID than the one ffmpeg is streaming to. The relay is "live" in its own state machine because ffmpeg stayed up for liveConfirmMs (4s) — this does NOT confirm CF Stream is receiving/processing the stream.

- timestamp: 2026-04-09T02:01:00Z
  checked: stream.remote.ts — HLS URL construction and JWT format
  found: URL: `https://customer-${CF_STREAM_CUSTOMER_CODE}.cloudflarestream.com/${token}/manifest/video.m3u8`. Token `sub` = `CF_STREAM_LIVE_INPUT_UID`. Token `kid` appears in BOTH header AND payload (non-standard but CF Stream docs show kid in payload too). No liveSrc logging exists — the URL is opaque from browser console. stream.copy.remote.ts exists as a debugging copy with logging (exposes customer, uid, token) but is NOT imported by +page.svelte.
  implication: We cannot verify the URL correctness from browser console alone. We need to expose liveSrc in the browser so it can be curl-tested and the UID can be cross-checked against the CF Stream live input receiving ffmpeg's stream.

- timestamp: 2026-04-09T02:02:00Z
  checked: relay/src/index.ts — how relay state machine transitions to 'live'
  found: After `ffmpeg.start()` succeeds, relay waits `liveConfirmMs` (4 seconds default) checking `ffmpeg.isRunning()` in a 200ms poll. If ffmpeg is still running after 4s → transitions to 'live'. This is purely a process-liveness check. It does NOT verify that CF Stream is receiving the RTMP stream, that the RTMPS key is valid, or that CF Stream is ingesting successfully.
  implication: Relay 'live' state ≠ CF Stream ingesting. ffmpeg could be running but rejected by CF Stream (wrong key, network issue) and the relay would still report 'live'. ffmpeg doesn't immediately exit on RTMPS auth failure — it keeps trying to reconnect, giving the appearance of "running."

## Resolution

root_cause: UNKNOWN — CF Stream returning 204 indefinitely. Three candidate causes ranked by probability: (1) Mismatch between the live input key in relay STREAM_URL (what ffmpeg pushes to) and the live input UID in CF_STREAM_LIVE_INPUT_UID (what the HLS JWT encodes) — ffmpeg pushes to input A, browser requests HLS for input B; (2) JWT token is structurally valid but CF_STREAM_LIVE_INPUT_UID or CF_STREAM_CUSTOMER_CODE env vars hold wrong values (wrong account, wrong UID); (3) CF Stream rejects the RTMPS stream silently (wrong key, wrong format) and ffmpeg keeps reconnecting but CF Stream never ingests.
fix: Expose liveSrc in browser console via diagnostic log in VideoPlayer.svelte; provide instructions to curl the manifest URL and decode the JWT sub claim to verify against CF Stream dashboard.
verification: pending
files_changed: [packages/web/src/lib/components/VideoPlayer.svelte, packages/web/src/routes/+page.svelte, packages/relay/src/index.ts]
