---
status: awaiting_human_verify
trigger: 'Entire relay-to-browser streaming pipeline is intermittently broken. Works once then fails. Different browser = immediate failure. Zero console logs when failing. Button shows Streaming before actually live.'
created: 2026-04-13T00:00:00Z
updated: 2026-04-13T00:00:00Z
---

## Current Focus

hypothesis: Multiple compounding issues: (H1) ALL console logging is gated behind **DEV** so production is completely silent — user has no observability. (H2) Button shows "Streaming" when phase==='live' but 'live' only means relay is live, NOT that video is playing. (H3) The "works once then fails" pattern needs investigation — could be JWT caching, relay state, or VideoPlayer state not resetting properly between sessions. (H4) The manifest probe may be succeeding but then HLS.js is failing silently for some other reason.
test: Fix the clear bugs (H1, H2) and add diagnostic logging to understand H3/H4
expecting: With proper logging and button states, the intermittent failures will either stop or become diagnosable
next_action: Implement fixes for all identified issues

## Symptoms

expected: User presses button → stream starts within ~5 seconds → video plays smoothly. Button should only show "Streaming" when video is actually playing.
actual: Stream works once, then stops working. Different browser = immediate failure. Even the original browser then fails. When it fails, there are ZERO console logs — as if the stream startup code path isn't even executing. Button prematurely shows "Streaming" success state.
errors: When failing — NO errors, no logs at all. When working — shows normal empty manifest → retry → playback flow.
reproduction: Start stream from traskriver.com. May work once. Try different browser or retry = fails silently.
timeline: Got progressively worse through multiple debug/fix sessions. The "no logs at all" symptom is NEW.

## Eliminated

## Evidence

- timestamp: 2026-04-13T01:00:00Z
  checked: All console.log/debug/warn calls in +page.svelte and VideoPlayer.svelte
  found: In +page.svelte, ALL 8 console calls are gated behind `if (__DEV__)`. In VideoPlayer.svelte, 15 of 17 calls are gated. Only 2 are ungated: (1) console.warn for fatal HLS errors (line 218) and (2) console.debug for levelEmptyError counts (line 198, but gated by **DEV** AND count check). In production, the ONLY console output is fatal HLS console.warn.
  implication: In production, the user sees ZERO console output during normal operation. Even during failures, unless HLS.js hits a fatal error, there's complete silence. The "no console logs at all" symptom is EXPECTED in production — it's not a sign that code isn't running, it's just that there's no production logging. This explains the different behavior between dev (where logs appeared) and production (where they don't).

- timestamp: 2026-04-13T01:01:00Z
  checked: Button label and color logic for "Streaming" state
  found: ctaLabel shows "Streaming" when `phase === 'live' || phase === 'viewing'` (line 81). Button turns green (`bg-emerald-700/80`) for same condition (line 510). BUT phase='live' only means "relay reports live" — VideoPlayer hasn't started playing yet. The header status badge correctly distinguishes (line 420: 'live' → "Connecting"), but the CTA button does not.
  implication: User sees green "Streaming" button immediately when relay reports live, even though video may still be probing/loading for 10-30+ seconds. This is the premature "Streaming" bug.

- timestamp: 2026-04-13T01:02:00Z
  checked: VideoPlayer manifestReady state lifecycle and reset behavior
  found: `manifestReady` is initialized to `false` and set to `true` when manifest probe succeeds. BUT when the VideoPlayer component unmounts (e.g., showPlayer becomes false when phase changes away from live/viewing/ended_confirming) and later remounts, it creates a FRESH component instance with manifestReady=false again. So manifestReady resets correctly on remount. The manifest probe $effect re-runs correctly when component mounts.
  implication: VideoPlayer state reset is not the issue — component lifecycle handles it. The "works once then fails" must be elsewhere.

- timestamp: 2026-04-13T01:03:00Z
  checked: SvelteKit query() caching for getStreamInfo
  found: query() caches by argument. getStreamInfo() takes no arguments, so ALL calls share one cache entry. The cache "survives" as long as the query is actively used in a reactive context. The `{@const stream = await getStreamInfo()}` inside the svelte:boundary IS a reactive context. When demandRegistered goes from false→true→false→true (restart stream), the boundary unmounts then remounts, calling getStreamInfo() again. query() may return the CACHED result — same JWT, same URL. Since JWT TTL is 3600s, this is fine for 1 hour.
  implication: JWT caching is NOT the issue for "works then fails" within a 1-hour window. The same JWT should work fine for both the original and different browsers.

- timestamp: 2026-04-13T01:04:00Z
  checked: What happens when user clicks "Start Stream" and relay is already live (from prior demand)
  found: registerDemand() POSTs to /api/stream/demand, sets demandRegistered=true, phase='starting', polling=true. Polling immediately starts. If relay is ALREADY live (from prior session or other browser), first poll returns state='live'. Phase transitions starting→live. showPlayer becomes true. Button shows green "Streaming". The boundary needs to resolve getStreamInfo() first, then VideoPlayer mounts and starts manifest probe. If manifest is already available (stream was already running), playback starts quickly.
  implication: The flow is actually correct for the "already live" case. But the button prematurely shows "Streaming" before VideoPlayer even mounts. The user sees success before anything plays.

- timestamp: 2026-04-13T01:05:00Z
  checked: How manifestReady probe works and potential issues
  found: The probe fetches the master manifest, follows to first rendition URL, checks for #EXTINF. If CF Stream JWT is embedded in the master URL and the rendition URL is relative, the rendition inherits the JWT. But the cache-busting adds `_cb=Date.now()` which is fine. The probe uses `cache: 'no-store'` fetch option. The probe runs every 3s until ready.
  implication: The manifest probe itself looks correct. If CF Stream is serving segments, the probe should detect them. If the probe succeeds, manifestReady=true and HLS.js gets the URL. The remaining question is: does HLS.js then successfully play?

## Resolution

root_cause: |
Multiple compounding issues creating an unreliable and undiagnosable streaming pipeline:

**RC1 (Critical): Zero production logging — completely blind in production**
Every single console.log/debug call in both +page.svelte and VideoPlayer.svelte was gated behind `__DEV__` (import.meta.env.DEV), which is false in production builds. The ONLY production console output was `console.warn` for fatal HLS errors. This means:

- The "no console logs at all" symptom was EXPECTED in production — it doesn't mean code isn't running
- When the stream works in dev but "fails silently" in production, it may actually BE working — just no way to tell
- When it genuinely fails, there's zero diagnostic information
- The user's observation of "saw logs initially, then no logs" was likely dev→prod switch

**RC2 (High): Button shows green "Streaming" before video is actually playing**
The CTA button and its color were tied to `phase === 'live' || phase === 'viewing'`. Phase 'live' means the relay reports live, NOT that video is playing. The VideoPlayer still needs 10-30+ seconds to probe manifests, mount HLS.js, and start playback. During this entire window, the button falsely showed success state (green, checkmark, "Streaming"), making the user think the stream was live when it was still connecting.

**RC3 (High): No demand heartbeat — relay stops after 5 minutes**
The demand KV entry has a 5-minute window (DEMAND_WINDOW_SECONDS default=300). The browser registers demand once on "Start Stream" but never refreshes it. After 5 minutes of viewing, the relay polls and sees shouldStream=false, stops ffmpeg, and the stream dies. This is a guaranteed failure for any viewing session longer than 5 minutes.

**RC4 (Medium): Error boundary's failed snippet invisible behind overlays**
If getStreamInfo() throws an error (e.g., network failure, CF Worker error), the failed snippet renders at z-0, behind the phase overlay divs at z-30. The error message and retry button are invisible to the user. They see the phase overlay (e.g., "Starting stream...") with no way to recover.

fix: |
**F1: Add production-safe logging for key lifecycle events**
Added a `log()` helper in both files that uses `console.log` (not gated by **DEV**) for critical milestones: demand registration, relay state transitions, manifest probe start/ready/fail, HLS provider attach, playback start, fatal errors, remounts. Kept verbose debug logging behind **DEV**. This provides production observability without flooding the console.

**F2: Fix button to correctly distinguish 'live' (connecting) from 'viewing' (streaming)**

- Button label: `phase === 'live'` now shows "Connecting…" instead of "Streaming"
- Button color: `phase === 'live'` now shows secondary/gray (with spinner) instead of green
- Button icon: `phase === 'live'` shows spinning loader instead of checkmark
- Green success state (checkmark + "Streaming") only appears when `phase === 'viewing'` (actual video playback confirmed)
- Header status badge was already correct ('live' → "Connecting")

**F3: Add demand heartbeat to keep relay alive during viewing**
Added an $effect that fires every 2 minutes while sessionActive is true, POSTing to /api/stream/demand. This refreshes the KV timestamp so the relay keeps streaming beyond the initial 5-minute demand window. Best-effort (catches errors silently) — the relay will keep running until its current TTL expires even if a heartbeat fails.

**F4: Fix error boundary z-index and text color**
Changed the failed snippet from z-0 to z-40 (above all phase overlays) and text from text-secondary to text-light with drop-shadow so it's visible against the dark stream background.

**F5: Add onerror handler to svelte:boundary**
Added `onerror` handler that logs getStreamInfo() failures in production, so we can see if the remote function call is silently erroring.

verification: |

- `svelte-check`: 0 errors, 0 warnings
- `bun run build`: successful production build
- `svelte-autofixer`: 0 issues
- Awaiting user verification with live stream

files_changed:

- packages/web/src/lib/components/VideoPlayer.svelte
- packages/web/src/routes/+page.svelte
