---
created: 2026-03-19T16:25:42.334Z
title: Triage viewer count fluctuation
area: ui
files:
  - src/lib/components/LiveViewerCount.svelte:10-28
---

## Problem

Loading the site and doing nothing but watching the console produces fluctuating viewer counts — values like 0, 1, 0, 1, 2, 0, 1 cycling every ~10 seconds with no user interaction. The component polls `/${token}/views` every 10 seconds via `setInterval`. The root cause is unclear: it could be the CF Stream `/views` API itself returning inconsistent values for a near-zero-viewer stream, or it could be multiple component instances mounting (e.g. the `{#await getStreamInfo() then stream}` block in the header causing a second instance), or the `$effect` reactivity re-running and creating duplicate intervals.

## Solution

1. Check if multiple `LiveViewerCount` instances are mounting (console log in `onMount` or `$effect`)
2. Confirm the CF `/views` API is inherently noisy at low viewer counts — if so, apply a smoothing strategy (e.g. only update if delta > 1, or debounce rapid changes)
3. Consider whether the viewer count should only be shown when `sessionActive` is true (it's already gated, but the polling starts regardless)
4. Possibly remove the poll entirely when viewer count is 0 and only resume on first non-zero result
