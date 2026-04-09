---
status: awaiting_human_verify
updated: 2026-04-09T00:00:00Z
trigger: "Stream stuck at 'Starting' despite relay being live — phase never transitions from starting to live/viewing"
created: 2026-04-08T00:00:00Z
updated: 2026-04-08T00:00:00Z
---

## Current Focus

hypothesis: player.play() on a vidstack <media-player> after a fatal 204 manifestParsingError is a no-op because HLS.js has stopped loading. The retry loop polls play() but vidstack correctly rejects with "media is not ready". Fix: use {#key playerKey} on <media-player> to remount the element on each retry cycle, which creates a fresh HLS.js instance that will attempt to load the manifest again.
test: Implement {#key playerKey} remount strategy — increment playerKey on each retry tick instead of calling player.play()
expecting: Fresh HLS.js instance on each cycle will eventually get a valid manifest when CF Stream becomes ready, fire can-play, and autoplay will handle the rest
next_action: Implement fix in VideoPlayer.svelte

## Symptoms

expected: Click "Start Stream" → status shows "Starting" → relay goes live → status shows "Live" (phase=live) → video plays → status shows "Live" with green dot (phase=viewing)
actual: Click "Start Stream" → status shows "Starting" → stays at "Starting" forever. Video never plays. Relay IS live (`curl` confirms `{"state":"live","stale":false}`)
errors: "manifestParsingError, code: 204" (earlier — may still occur if CF Stream HLS endpoint returns 204 despite broadcast); "$.get(player).play is not a function" (patched with typeof guard, but guard may prevent playback)
reproduction: 1. Go to https://stream.jspn.workers.dev 2. Click start stream button 3. Observe status stuck at "Starting" 4. Relay confirmed live via curl
started: After JWT signing was added; relay heartbeat was recently added; worker was redeployed

## Eliminated

(none yet)

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

- timestamp: 2026-04-08T00:08:00Z
  checked: The `manifestParsingError` / 204 error handling in VideoPlayer
  found: Both `handleError` (line 70-108) and `onLiveError` (line 145-174) check for manifestParsingError/204 and silently return without calling `onError()`. This means if CF Stream returns 204, the error is swallowed and the player stays in a non-playing state. The `sessionActive` effect (line 188-200) would retry `player.play()` whenever `sessionActive` changes (it's reactive on `sessionActive`, `player`, and `isPlaying`). BUT — `sessionActive` doesn't change between `starting` and `live` (both are true). And `player` reference doesn't change. And `isPlaying` stays false. So the effect runs ONCE and doesn't re-run.
  implication: CRITICAL — After the initial `player.play()` fails with 204/manifestParsingError, there is NO retry mechanism. The `$effect` at line 188 only re-runs when its reactive dependencies change, and none of them change after the initial call. The video player is stuck in a dead state.

## Resolution

root_cause: **Three-layer problem:** (1) After a fatal 204/manifestParsingError HLS.js stops all loading permanently — it cannot be recovered by calling player.play(). The prior fix (retry loop calling player.play()) was rejected by vidstack with "media is not ready - wait for can-play event" because can-play never fires when HLS.js is stopped. (2) Original root cause still stands: one-shot $effect for player.play() meant no retry at all. (3) Relay heartbeat exhausting KV free tier. Final root cause for playback: calling player.play() after a fatal HLS error is the wrong API; HLS.js needs its instance destroyed and recreated, which in Svelte is done by remounting the <media-player> element.
fix: (1) Replaced retry-play loop with remount loop in VideoPlayer.svelte: added `playerKey` reactive state, wrapped `<media-player>` in `{#key playerKey}`, and the retry interval now sets `player = undefined; playerKey += 1` each cycle instead of calling `player.play()`. Incrementing playerKey destroys the stopped HLS.js instance and mounts a fresh one. The `autoplay` attribute on the fresh element handles play() once the manifest loads. (2) Status badge: "Connecting" for `phase === 'live'`, "Starting" only for `phase === 'starting'`. (3) Relay heartbeat rate-limited to 60s minimum interval.
verification: svelte-check passes with 0 errors and 0 warnings. Awaiting human verification with live relay.
files_changed: [packages/web/src/lib/components/VideoPlayer.svelte, packages/web/src/routes/+page.svelte, packages/relay/src/index.ts]
