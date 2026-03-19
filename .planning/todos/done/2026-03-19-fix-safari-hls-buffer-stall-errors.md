---
created: 2026-03-19T16:28:54.006Z
title: Fix Safari HLS buffer stall errors
area: ui
files:
  - src/lib/components/VideoPlayer.svelte:35-53
---

## Problem

In Safari, loading the site with no user interaction eventually produces repeated stream errors logged to console. The error chain is:

```
[river-stream][VideoPlayer] – "Stream error:"
type: "hls-error"
detail.type: "mediaError"
detail.details: "bufferStalledError"
detail.fatal: false
detail.error: "Playback stalling at @7.43s due to low buffer (len: 2.63s)"
```

HLS.js's buffer polling detects playback stalling due to low buffer (`_reportStall → poll → tick`). The error is `fatal: false`, meaning HLS.js considers it recoverable — but the current `handleError` in `VideoPlayer.svelte` does not distinguish fatal vs non-fatal errors. It calls `onError?.()` unconditionally, which sets the status badge to "Error" and treats the stream as broken even when HLS.js might recover on its own.

Additionally, Safari's HLS handling differs from Chrome/Firefox — it may be more sensitive to buffering gaps on live streams, especially during the initial segment load or when the stream has just started.

## Solution

1. **Check `e.detail.fatal`** before treating as a real error — non-fatal HLS errors (like `bufferStalledError`) should be logged but not surface the error UI. Only call `onError?.()` when `fatal === true`.
2. **Suppress non-fatal hls-error events** in both `handleError` (the `$effect` listener) and `onLiveError` (the `onerror` attribute handler).
3. Consider adding a **recovery attempt** for non-fatal buffer stalls: HLS.js has a `recoverMediaError()` method that can be called on the provider's `hls` instance via vidstack's API.
4. Test specifically in Safari — the issue may not reproduce in Chrome.
