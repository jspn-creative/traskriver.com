# Phase 08: Stream UX - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-08
**Phase:** 08-stream-ux
**Areas discussed:** Relay status fetching, State transitions & UI mapping, Stream ended experience, Unavailable vs Starting visual distinction

---

## Relay Status Fetching

### How should the web app get relay status?

| Option | Description | Selected |
|--------|-------------|----------|
| New GET endpoint | Add a public GET /api/relay/status that reads relay-status KV and returns the state + timestamp. Page polls this after demand registration. Simple, single-purpose. | ✓ |
| Extend demand POST response | Have POST /api/stream/demand return relay status alongside { ok: true }. Less polling, but couples demand registration with status reads. | |
| SSE/EventSource stream | Server-sent events from a Worker endpoint. Real-time updates without polling. More complex — Workers have limits on long-lived connections. | |

**User's choice:** New GET endpoint (Recommended)
**Notes:** None

### How often should the page poll relay status?

| Option | Description | Selected |
|--------|-------------|----------|
| Every 3 seconds | Fast enough to feel responsive when relay transitions to 'live' (~3s worst-case delay). Light on KV reads. Stops polling once stream is playing. | ✓ |
| Every 5 seconds | More conservative. Up to 5s delay noticing state changes. Lower KV read cost. | |
| You decide | Agent picks the interval based on what works best technically. | |

**User's choice:** Every 3 seconds (Recommended)
**Notes:** None

### When should relay status polling stop?

| Option | Description | Selected |
|--------|-------------|----------|
| Stop when video starts playing | Once VideoPlayer fires onPlaying, status is confirmed. Stop polling to save resources. Resume only if stream errors out. | ✓ |
| Keep polling during playback | Continue polling throughout the session to detect relay state changes. Higher resource use but catches edge cases faster. | |
| You decide | Agent picks based on technical tradeoffs. | |

**User's choice:** Stop when video starts playing (Recommended)
**Notes:** None

---

## State Transitions & UI Mapping

### How should page phase transitions work with real relay data?

| Option | Description | Selected |
|--------|-------------|----------|
| Relay-driven phases | Replace setTimeout with relay-status polling results. 'sales' → click → 'connecting' (when relay idle/starting) → 'connected' (when relay live + HLS playing) → 'telemetry' (after short delay for UI polish). Fake timers removed entirely. | ✓ |
| Hybrid approach | Keep the current timed animation sequence for the visual transition, but gate the 'connected' step on actual relay 'live' status. | |
| You decide | Agent designs the transition logic based on what makes the UX smoothest. | |

**User's choice:** Relay-driven phases (Recommended)
**Notes:** None

### Should the existing page 'phase' state names change?

| Option | Description | Selected |
|--------|-------------|----------|
| Rename to match stream states | Replace 'sales'/'connecting'/'connected'/'telemetry' with stream-meaningful names. Makes the code self-documenting and aligned with relay states. | ✓ |
| Keep current names | Keep 'sales'/'connecting'/'connected'/'telemetry'. They describe the UI state, not the relay state. Less refactoring. | |
| You decide | Agent picks names that make the code clearest. | |

**User's choice:** Rename to match stream states (Recommended)
**Notes:** None

### How long should the page wait in 'starting' before giving up?

| Option | Description | Selected |
|--------|-------------|----------|
| 60 seconds | Relay needs time to boot ffmpeg, negotiate RTSP, and push RTMPS. 60s covers slow starts without leaving users hanging forever. | ✓ |
| 90 seconds | Extra generous for cold-start scenarios. More patience, but users wait longer if something's actually broken. | |
| No timeout — trust the relay | Keep polling indefinitely as long as relay-status is fresh. Only show error if relay goes offline. | |

**User's choice:** 60 seconds (Recommended)
**Notes:** None

---

## Stream Ended Experience

### How should the web app detect stream end?

| Option | Description | Selected |
|--------|-------------|----------|
| HLS error + resume polling | When VideoPlayer fires onError (fatal HLS error), resume relay-status polling to confirm. If relay shows 'stopped' or 'idle', show 'Stream ended'. Combines HLS signal with relay confirmation. | ✓ |
| HLS error only | Trust the VideoPlayer error as the primary signal. Show 'Stream ended' immediately. Simpler, but might flash 'ended' on transient network issues. | |
| Polling only | Keep polling relay status even during playback. When relay transitions to 'stopped'/'idle', show 'Stream ended'. | |

**User's choice:** HLS error + resume polling (Recommended)
**Notes:** None

### What happens when user clicks 'Restart stream'?

| Option | Description | Selected |
|--------|-------------|----------|
| Full reset — back to 'starting' | Click fires new demand POST, page goes back to 'starting' state with relay-status polling. Same flow as initial start. | ✓ |
| Optimistic restart | Click fires new demand POST and immediately shows 'starting' without waiting for demand response. Feels faster, but jarring if POST fails. | |
| You decide | Agent designs the restart UX. | |

**User's choice:** Full reset — back to 'starting' (Recommended)
**Notes:** None

### Where does the 'Stream ended' prompt appear?

| Option | Description | Selected |
|--------|-------------|----------|
| In the video area | Replace the video player with a centered message + restart button over the poster image. Sidebar/drawer stays visible. | ✓ |
| In the sidebar/panel | Show the restart prompt in the PassDetailsPanel area. Consistent with initial start button position. | |
| Both locations | Show in video area AND re-enable sidebar button. Redundant but ensures visibility. | |

**User's choice:** In the video area (Recommended)
**Notes:** None

---

## Unavailable vs Starting Visual Distinction

### What tone for 'Stream unavailable' vs 'Starting stream...'?

| Option | Description | Selected |
|--------|-------------|----------|
| Informational, not alarming | 'Starting' = optimistic pulse. 'Unavailable' = static muted message. No red error colors — nature camera, not 911 system. | ✓ |
| Clear error distinction | 'Starting' = pulse animation + progress feel. 'Unavailable' = warning icon, amber/red styling. More obvious but heavy for a chill nature stream. | |
| You decide | Agent designs the visual distinction. | |

**User's choice:** Informational, not alarming (Recommended)
**Notes:** None

### When stream is unavailable, can user still click 'Start stream'?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, but with reduced expectations | Button still works. Label changes to 'Try starting stream'. Registers demand in case relay comes back. | ✓ |
| No — disable the button | If relay is offline, disable the button. Show 'Stream offline — check back later.' | |
| You decide | Agent picks based on UX tradeoff. | |

**User's choice:** Yes, but with reduced expectations (Recommended)
**Notes:** None

### How should the page determine initial relay status on page load?

| Option | Description | Selected |
|--------|-------------|----------|
| Fetch relay status on page load | One GET call on load. If relay is 'live', hint 'Stream is live — join now' on the button. | |
| No pre-fetch — always start neutral | Page always loads with default 'Start stream' state. Only fetch relay status after user clicks. | ✓ |
| You decide | Agent picks based on implementation simplicity vs UX value. | |

**User's choice:** No pre-fetch — always start neutral
**Notes:** None

---

## Agent's Discretion

- Exact page phase state names
- Loading skeleton/animation design during "starting" state
- Exact copy and layout for "Stream ended" and "Stream unavailable"
- Error state handling for edge cases
- Header status badge behavior
- Transition animations between states

## Deferred Ideas

None — discussion stayed within phase scope.
