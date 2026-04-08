# Research: Polling Patterns for Demand-Driven Streaming

**Date:** 2026-03-19
**Context:** v3.0 On-Demand Streaming — relay device polls CF Worker for demand state, starts/stops ffmpeg accordingly.

---

## 1. Cloudflare KV for Demand State

### Key Structure

**Recommendation: Single key with JSON value.**

```
Key:   "stream-demand"
Value: { "timestamp": 1710859200000, "source": "page-load" }
```

A single key is the right choice here. The demand question is binary (is anyone watching?) and the answer is a single timestamp. Multiple keys (per-viewer, per-session) would add complexity with no benefit — you don't need to enumerate viewers, you need to know when the _last_ demand occurred.

If you later want viewer count hints, store it in the same value:

```json
{ "timestamp": 1710859200000, "viewers": 3 }
```

The `viewers` field would be approximate (it's KV, not a counter), but useful as a hint to the relay for logging/diagnostics.

**Avoid:** Separate keys like `stream-demand:{session-id}` per visitor. You'd need to list/scan keys to determine aggregate demand, which is slow and expensive ($5/million list ops). A single key with "latest timestamp wins" is simpler and cheaper.

### Eventual Consistency — Does It Matter?

**No, not for this use case.** Here's why:

- **KV consistency model:** Writes are immediately visible at the PoP where they were made. Other PoPs see updates within ~60 seconds (or the `cacheTtl` duration).
- **Your write location:** The SvelteKit `load` function runs on a CF Worker, which writes to KV. The relay polls a CF Worker, which reads from KV. Both the write and read happen inside the CF Worker runtime — they go through KV's central stores. The relay is not reading from a separate PoP's cache; it's hitting an API endpoint that reads KV server-side.
- **Worst case:** If the write PoP and read PoP differ (user visits from Tokyo, relay polls from a US Worker), the relay could see stale data for up to 60 seconds. But with a 5-minute demand window, a 60-second delay means the relay starts streaming within ~60 seconds of the first viewer — acceptable for the "Starting stream..." UX.
- **KV `cacheTtl`:** Default is 60 seconds. For this use case, you could lower it to 30 seconds (the minimum) to reduce staleness, but the benefit is marginal. The relay polls every 5-10 seconds anyway, so once the KV cache refreshes, the relay picks it up on the next poll.

**Key insight:** Eventual consistency matters when you need read-your-own-writes or cross-writer coordination. Here, you have one conceptual writer (the latest viewer) and one reader (the relay), with a 5-minute tolerance window. 60 seconds of staleness is noise.

### Cost Analysis

**Reads (relay polling):**

- Polling every 10 seconds = 6 reads/minute = 360 reads/hour = 8,640 reads/day = ~259,200 reads/month
- Polling every 5 seconds = doubles to ~518,400 reads/month
- Free plan: 100,000 reads/day → 10s polling uses ~8,640/day, well within free tier
- Paid plan: 10 million reads/month included → 518K is 5% of the free allowance

**Writes (viewer demand):**

- Each page load writes once. Even with 1,000 page loads/day = 1,000 writes/day
- Free plan: 1,000 writes/day → just barely fits
- Paid plan: 1 million writes/month included → trivial

**Storage:**

- One key with a ~100-byte JSON value. Essentially zero.

**Verdict:** This is well within the free tier for a low-traffic site. Even at moderate traffic, KV costs for this pattern are negligible. The relay's polling reads dominate, but at ~500K/month, they're under the paid plan's free allowance.

### KV Binding Configuration

Add to `wrangler.jsonc`:

```jsonc
{
	"kv_namespaces": [
		{
			"binding": "STREAM_KV",
			"id": "<namespace-id>",
			"preview_id": "<preview-namespace-id>"
		}
	]
}
```

Access in SvelteKit via `platform.env.STREAM_KV` in server load functions, or through the Worker's `env` object in API routes.

---

## 2. Demand API Design

### Endpoint: `GET /api/stream/demand`

The relay polls this endpoint. It should return everything the relay needs to make a decision in a single request.

### Recommended Response Shape

```typescript
type DemandResponse = {
	/** Whether the relay should be actively streaming */
	shouldStream: boolean;
	/** Unix timestamp (ms) of the most recent demand, or null if none */
	demandTimestamp: number | null;
	/** Seconds remaining before demand expires, or 0 if expired */
	ttlSeconds: number;
	/** Approximate viewer count hint (from KV value, not authoritative) */
	viewerHint: number;
};
```

**Example responses:**

Active demand:

```json
{
	"shouldStream": true,
	"demandTimestamp": 1710859200000,
	"ttlSeconds": 247,
	"viewerHint": 2
}
```

No demand / expired:

```json
{
	"shouldStream": false,
	"demandTimestamp": 1710858900000,
	"ttlSeconds": 0,
	"viewerHint": 0
}
```

No demand ever recorded:

```json
{
	"shouldStream": false,
	"demandTimestamp": null,
	"ttlSeconds": 0,
	"viewerHint": 0
}
```

### Why Not Just a Boolean?

A plain `true`/`false` works but leaves the relay blind. Including `ttlSeconds` lets the relay:

- Anticipate shutdown ("demand expires in 30s, prepare for graceful stop")
- Log meaningful state ("streaming, 4:07 remaining")
- Adjust polling frequency if desired (poll more frequently near expiry)

Including `demandTimestamp` lets the relay:

- Detect whether the timestamp actually changed between polls
- Log when demand was last received for debugging

### HTTP Status Codes

| Scenario                               | Status                      | Body                            |
| -------------------------------------- | --------------------------- | ------------------------------- |
| Normal response (demand or no demand)  | `200 OK`                    | `DemandResponse` JSON           |
| Relay sends invalid/missing auth token | `401 Unauthorized`          | `{ "error": "unauthorized" }`   |
| KV read failure or internal error      | `500 Internal Server Error` | `{ "error": "kv_read_failed" }` |

**Don't use 204 or 404 for "no demand."** The relay should always get a 200 with a parseable body. Reserve non-200 for actual errors. This makes the relay's polling loop simpler: `if (response.ok)` → parse and act; `else` → log error and retry.

### Authentication

The relay endpoint should be authenticated to prevent abuse. Options:

- **Bearer token (shared secret):** Simplest. Relay sends `Authorization: Bearer <RELAY_SECRET>`. Worker checks against an env var. Good enough for a single relay device.
- **Don't use:** API keys in query params (logged in access logs), IP allowlists (relay is behind NAT with dynamic IP).

### Demand Write Endpoint

When a viewer loads the page, the SvelteKit `load` function writes demand to KV directly — no separate "demand write" API needed. The load function already has access to `platform.env.STREAM_KV`. This keeps the write path invisible to clients and eliminates a public endpoint that could be abused.

---

## 3. Relay Polling Loop Design

### setTimeout Chaining vs setInterval

**Use `setTimeout` chaining.** `setInterval` is problematic because:

- If a poll takes longer than the interval (network timeout), polls stack up
- Drift accumulates — if the poll itself takes 500ms, effective interval becomes `N + 500ms` with setTimeout chaining, but overlapping with setInterval
- No backpressure — setInterval fires regardless of whether the previous callback finished

`setTimeout` chaining ensures the next poll doesn't start until the current one finishes:

```typescript
async function pollLoop(intervalMs: number) {
	while (running) {
		const start = Date.now();
		await poll();
		const elapsed = Date.now() - start;
		const delay = Math.max(0, intervalMs - elapsed);
		await sleep(delay);
	}
}
```

This gives you consistent spacing (N seconds between _end_ of one poll and _start_ of the next) and zero overlap.

### Network Failure Strategy

**Skip and retry next cycle.** Don't do exponential backoff for transient failures in a polling loop — you already have a built-in retry (the next poll in 5-10 seconds). Backoff is for burst requests that might overwhelm a server; a single poll every 5-10 seconds isn't that.

```typescript
async function poll(): Promise<DemandResponse | null> {
	try {
		const response = await fetch(DEMAND_URL, {
			headers: { Authorization: `Bearer ${RELAY_SECRET}` },
			signal: AbortSignal.timeout(8000) // timeout < poll interval
		});
		if (!response.ok) {
			log.warn(`demand API returned ${response.status}`);
			consecutiveFailures++;
			return null;
		}
		consecutiveFailures = 0;
		return await response.json();
	} catch (err) {
		consecutiveFailures++;
		log.warn(`demand API unreachable (${consecutiveFailures} consecutive failures)`, err);
		return null;
	}
}
```

**On failure:**

- Return `null` → main loop treats null as "no change, keep current state"
- Track consecutive failures for logging/alerting
- If `consecutiveFailures > N` (e.g., 30 = ~5 minutes at 10s intervals), stop ffmpeg to avoid streaming to nobody indefinitely

**Request timeout:** Set `AbortSignal.timeout()` shorter than the poll interval (e.g., 8s timeout for 10s poll interval) so a stalled request doesn't block the loop.

### ffmpeg Process Lifecycle

This is the most critical part. State machine:

```
┌─────────┐  demand=true   ┌──────────┐  ffmpeg connected  ┌─────────┐
│  IDLE   │ ──────────────→ │ STARTING │ ─────────────────→ │ LIVE    │
└─────────┘                 └──────────┘                    └─────────┘
     ↑                           │                               │
     │                           │ ffmpeg exits/crashes           │ demand=false
     │                           ↓                               ↓
     │                      ┌──────────┐                   ┌──────────┐
     │←─────────────────────│ COOLDOWN │←──────────────────│ STOPPING │
     │    cooldown elapsed  └──────────┘   ffmpeg exited   └──────────┘
     │                           │
     │                           │ demand=true during cooldown
     │                           ↓
     │                      ┌──────────┐
     └──────────────────────│ STARTING │ (restart)
                            └──────────┘
```

**States:**

- `IDLE` — No ffmpeg process. Not streaming. Waiting for demand.
- `STARTING` — ffmpeg spawned, waiting for it to connect and begin pushing RTMPS.
- `LIVE` — ffmpeg is running and pushing RTMPS. Stream is active on CF Stream.
- `STOPPING` — Demand expired. Sending SIGTERM to ffmpeg, waiting for graceful exit.
- `COOLDOWN` — ffmpeg exited. Brief pause (3-5s) before allowing restart. Prevents rapid start/stop thrashing.

```typescript
type RelayState = 'idle' | 'starting' | 'live' | 'stopping' | 'cooldown';

let state: RelayState = 'idle';
let ffmpegProcess: ChildProcess | null = null;

function handleDemand(demand: DemandResponse | null) {
	// On poll failure, don't change state
	if (demand === null) return;

	switch (state) {
		case 'idle':
			if (demand.shouldStream) {
				transition('starting');
				spawnFfmpeg();
			}
			break;

		case 'starting':
		case 'live':
			if (!demand.shouldStream) {
				transition('stopping');
				stopFfmpeg();
			}
			// If demand.shouldStream and already starting/live, do nothing (good)
			break;

		case 'stopping':
			// Even if new demand comes in, let the stop complete.
			// The cooldown state will check for demand and restart if needed.
			break;

		case 'cooldown':
			if (demand.shouldStream) {
				transition('starting');
				spawnFfmpeg();
			}
			break;
	}
}
```

### ffmpeg Spawn Pattern

```typescript
function spawnFfmpeg() {
	const proc = spawn(
		'ffmpeg',
		[
			'-rtsp_transport',
			'tcp',
			'-i',
			CAMERA_RTSP_URL,
			'-c:v',
			'copy',
			'-c:a',
			'aac',
			'-f',
			'flv',
			RTMPS_URL
		],
		{ stdio: ['ignore', 'pipe', 'pipe'] }
	);

	ffmpegProcess = proc;

	proc.stderr.on('data', (chunk) => {
		const line = chunk.toString();
		// Detect when ffmpeg has connected and is streaming
		if (line.includes('Output #0, flv') || line.includes('muxing overhead')) {
			if (state === 'starting') transition('live');
		}
	});

	proc.on('exit', (code, signal) => {
		ffmpegProcess = null;
		log.info(`ffmpeg exited: code=${code} signal=${signal}`);

		if (state === 'stopping') {
			transition('cooldown');
			setTimeout(() => {
				if (state === 'cooldown') transition('idle');
			}, COOLDOWN_MS);
		} else if (state === 'starting' || state === 'live') {
			// Unexpected exit (crash) — go to cooldown and allow restart
			log.error('ffmpeg exited unexpectedly');
			transition('cooldown');
			setTimeout(() => {
				if (state === 'cooldown') transition('idle');
			}, COOLDOWN_MS);
		}
	});
}

function stopFfmpeg() {
	if (ffmpegProcess) {
		ffmpegProcess.kill('SIGTERM');
		// Force kill after 10s if graceful shutdown fails
		setTimeout(() => {
			if (ffmpegProcess) {
				log.warn('ffmpeg did not exit gracefully, sending SIGKILL');
				ffmpegProcess.kill('SIGKILL');
			}
		}, 10000);
	}
}
```

### State Transition Logging

```typescript
function transition(newState: RelayState) {
	log.info(`[state] ${state} → ${newState}`);
	state = newState;
}
```

Every transition should be logged with timestamp. This is the primary debugging tool when something goes wrong on a remote, unattended device.

---

## 4. Race Conditions

### Two users visit simultaneously

**Not a problem.** Both page loads write a demand timestamp to the same KV key. KV's behavior: "last write wins." Since both writes are setting a timestamp that means "someone is watching right now," either timestamp is equally valid. The relay sees `shouldStream: true` regardless of which write landed last.

Even if the writes happen in the same second — KV enforces a max of 1 write per key per second, so the second write may get a 429. But that's fine: the first write already set the demand, and the second write's failure just means the timestamp doesn't get bumped by a fraction of a second. Demand is still registered.

### Relay is already streaming, gets another demand

**No-op.** The relay is in the `LIVE` state. `handleDemand()` sees `shouldStream: true` and does nothing — ffmpeg is already running. The demand timestamp getting refreshed in KV extends the 5-minute window, which is exactly the desired behavior. The relay doesn't need to know the timestamp changed; it just keeps seeing `shouldStream: true`.

### Relay is stopping, gets new demand

**Handled by the cooldown state.** The state machine deliberately ignores new demand during `STOPPING` — trying to abort a SIGTERM mid-flight is risky and complex. Instead:

1. `STOPPING` → ffmpeg exits → `COOLDOWN` (3-5 seconds)
2. On the next poll during `COOLDOWN`, if `shouldStream: true`, immediately transition to `STARTING`

Total delay for this edge case: ~5-15 seconds (ffmpeg graceful exit + cooldown + next poll). Acceptable. The web UI shows "Starting stream..." during this time.

### Demand expires while relay is in `STARTING` state

ffmpeg hasn't connected to CF Stream yet, and demand drops to `shouldStream: false`. The relay sends SIGTERM to the ffmpeg process that was starting up. It transitions through `STOPPING` → `COOLDOWN` → `IDLE`. Clean, no orphaned process.

### Network partition during streaming

If the relay can't reach the demand API for an extended period (e.g., 5+ minutes):

- `consecutiveFailures` counter grows
- Relay keeps streaming (poll returns null → no state change)
- After a threshold (configurable, e.g., 30 failures = 5 min at 10s), relay should stop streaming to avoid indefinite resource usage
- This is a policy decision: "if I can't confirm demand, assume no demand after N failures"

---

## 5. KV Write Patterns

### Multiple Concurrent Visitors

**Last write wins, and that's fine.** Here's the full analysis:

The SvelteKit `load` function runs on the CF Worker for every page load. If 5 users load the page within the same second:

1. All 5 invoke `platform.env.STREAM_KV.put("stream-demand", JSON.stringify({ timestamp: Date.now() }))`
2. KV rate limit: 1 write per key per second. 4 of the 5 writes may get 429 errors.
3. The one write that succeeds sets the demand timestamp.

**Does the 429 matter?** No. The goal is "at least one demand timestamp exists that's fresh." One successful write out of 5 concurrent attempts achieves that. The failed writes don't need to succeed.

**Mitigation if 429s concern you:**

- Wrap the KV write in a try/catch and silently swallow the error. The page load should not fail because demand registration failed.
- Alternatively, only write if demand is stale: read the current value first, and only write if the timestamp is older than (say) 30 seconds. This adds a read but eliminates redundant writes.

```typescript
// In SvelteKit load function
const current = await platform.env.STREAM_KV.get('stream-demand', 'json');
const now = Date.now();
const REFRESH_THRESHOLD_MS = 30_000; // Only write if demand is >30s old

if (!current || now - current.timestamp > REFRESH_THRESHOLD_MS) {
	try {
		await platform.env.STREAM_KV.put(
			'stream-demand',
			JSON.stringify({
				timestamp: now,
				viewers: (current?.viewers ?? 0) + 1 // Approximate, not authoritative
			})
		);
	} catch {
		// 429 or other KV error — demand may already be registered, don't fail the page
	}
}
```

This "read-before-write with threshold" pattern reduces writes from "every page load" to "at most once per 30 seconds per PoP," which:

- Avoids all 429s under normal traffic
- Reduces write costs
- Doesn't meaningfully affect demand freshness (30s granularity is fine for a 5-min window)

### Viewer Count Accuracy

Don't try to maintain an accurate viewer count in KV. KV is not a counter — there's no atomic increment. The `viewers` field in the KV value is a hint at best. For accurate viewer counts, use CF Stream's own `/views` endpoint (which is already polled by `LiveViewerCount` in the existing codebase).

### KV Expiration as a Safety Net

Set an `expirationTtl` on the KV write as a cleanup mechanism:

```typescript
await platform.env.STREAM_KV.put('stream-demand', JSON.stringify({ timestamp: now }), {
	expirationTtl: 600 // Auto-delete after 10 minutes
});
```

This ensures the key doesn't persist forever if traffic completely stops. The `expirationTtl` should be longer than the demand window (5 min) to avoid premature deletion. 10 minutes (2x the demand window) is a safe choice. Minimum allowed is 60 seconds.

---

## 6. Stream Readiness Detection

### The Problem

After the relay starts ffmpeg and begins pushing RTMPS to CF Stream, there's a delay before the HLS manifest is available to viewers. The web app needs to know when the stream is actually watchable.

### Detection Methods

#### Option A: Poll the CF Stream lifecycle endpoint (Recommended)

```
GET https://customer-<CODE>.cloudflarestream.com/<INPUT_ID>/lifecycle
```

Response when live:

```json
{ "isInput": true, "videoUID": "55b9b5ce48c3968c6b514c458959d6a", "live": true }
```

Response when idle:

```json
{ "isInput": true, "videoUID": null, "live": false }
```

**Pros:** No auth needed (public endpoint). Single field to check (`live: true/false`). Gives you the `videoUID` of the active broadcast. This is what the CF Stream Player itself uses internally.

**Cons:** Doesn't tell you when the HLS manifest has segments ready to play. `live: true` means "RTMPS connection established," not "HLS segments available." There's typically a 5-15 second gap between these two events.

#### Option B: Poll the HLS manifest directly

```
GET https://customer-<CODE>.cloudflarestream.com/<INPUT_ID>/manifest/video.m3u8
```

- Returns 200 with valid manifest when stream is live and ready to play
- Returns 200 with an empty/error manifest or non-200 when not live

**Pros:** Directly confirms playability — if the manifest returns 200 with segments, the stream is watchable.

**Cons:** Need to parse the response to distinguish "manifest exists but no segments yet" from "manifest ready with segments." Signed URL complication — if `requireSignedURLs` is enabled, the manifest URL needs a valid token, so you'd need to generate a signed URL for each poll.

#### Option C: Relay reports status back to KV

The relay knows when ffmpeg has connected and is pushing frames. It could write its own status to KV:

```typescript
await env.STREAM_KV.put(
	'relay-status',
	JSON.stringify({
		state: 'live', // 'idle' | 'starting' | 'live' | 'stopping'
		since: Date.now(),
		ffmpegPid: process.pid
	})
);
```

The web app reads `relay-status` and `stream-demand` to determine UX state:

- `relay-status.state === 'idle'` + demand fresh → "Starting stream..."
- `relay-status.state === 'starting'` → "Starting stream..."
- `relay-status.state === 'live'` → show player (but HLS may still need a few seconds)
- `relay-status.state === 'live'` + lifecycle `live: true` → stream is definitely watchable

**Pros:** The web app has full visibility into relay state without waiting for CF Stream to reflect it. Enables rich UX states. The relay is already polling the demand API, so it can write status on the same cycle.

**Cons:** Adds a second KV key. Relay must write on every state transition. Introduces another eventual-consistency surface.

### Recommended Approach: Relay status in KV + lifecycle endpoint as confirmation

1. Relay writes its state to KV (`relay-status`) on each transition
2. Web app reads `relay-status` to determine initial UX state
3. Once relay reports `live`, web app polls the lifecycle endpoint (`/lifecycle`) to confirm CF Stream has the connection
4. Once lifecycle shows `live: true`, web app renders the video player

This gives you:

- Fast feedback: "Starting stream..." appears immediately when demand is registered
- Accurate feedback: Video player only shows when CF Stream confirms the RTMPS connection
- Resilience: If the relay is offline, `relay-status` won't update, and the web app can show "Stream unavailable" instead of "Starting stream..." indefinitely

### Typical Delay: RTMPS Push to HLS Availability

Based on Cloudflare Stream's architecture:

1. **ffmpeg startup + RTSP negotiation:** 1-3 seconds (depends on camera and network)
2. **RTMPS connection to CF Stream:** 1-2 seconds (TLS handshake + ingest server assignment)
3. **First keyframe received + transcoding starts:** 1-5 seconds (depends on GOP size / keyframe interval of the source)
4. **First HLS segment available:** 2-6 seconds after transcoding starts (CF Stream generates segments; typical HLS segment length is 2-6 seconds)

**Total end-to-end: ~5-15 seconds** from ffmpeg spawn to first playable HLS segment.

Add polling delay on top:

- Relay poll interval: 5-10 seconds (worst case, demand was just set and the next poll hasn't fired)
- Web app lifecycle poll: 2-5 seconds

**Realistic user-perceived delay: 10-25 seconds** from clicking "Watch" to seeing video. This is why the "Starting stream..." UX state is essential.

### Optimizing Startup Latency

If 10-25 seconds feels too long:

- **Reduce relay poll interval to 3 seconds** during idle (costs more KV reads but improves responsiveness)
- **Pre-negotiate RTSP connection** — keep the RTSP TCP connection warm but don't stream data. On demand, send the PLAY command. Saves 1-3 seconds of RTSP negotiation. (Depends on camera firmware supporting idle connections.)
- **Lower ffmpeg keyframe interval** — set `-g 30` (1 keyframe per second at 30fps) for faster segment generation. Trade-off: slightly higher bitrate.
- **Future: Cloudflare Tunnel** — push-based notification eliminates the polling delay entirely. Sub-second start latency. As noted in PROJECT.md, this is the upgrade path if polling delay becomes a problem.

---

## Summary of Recommendations

| Decision                 | Recommendation                                                         | Rationale                               |
| ------------------------ | ---------------------------------------------------------------------- | --------------------------------------- |
| KV key structure         | Single key `stream-demand` with JSON value                             | Simplest; no scanning needed            |
| KV consistency           | Acceptable as-is (60s default cacheTtl)                                | 5-min demand window absorbs staleness   |
| KV write pattern         | Read-before-write with 30s threshold                                   | Eliminates 429s; reduces cost           |
| KV expiration            | `expirationTtl: 600` on demand writes                                  | Safety net for abandoned keys           |
| API response             | Rich JSON with `shouldStream`, `ttlSeconds`, `demandTimestamp`         | Enables smart relay behavior            |
| API auth                 | Bearer token (shared secret)                                           | Simple, sufficient for single relay     |
| Polling mechanism        | `setTimeout` chaining                                                  | No drift, no overlap                    |
| Network failure handling | Skip and retry next cycle; stop after N consecutive failures           | Polling loop is its own retry mechanism |
| ffmpeg lifecycle         | State machine: idle → starting → live → stopping → cooldown            | Handles all edge cases cleanly          |
| Race conditions          | Benign — last write wins; state machine ignores demand during stopping | No coordination needed                  |
| Stream readiness         | Relay status in KV + CF lifecycle endpoint polling                     | Fast feedback + accurate confirmation   |
| Startup latency budget   | ~10-25 seconds (polling + ffmpeg + HLS encoding)                       | Acceptable with "Starting stream..." UX |

---

_Research completed: 2026-03-19 for v3.0 milestone_
