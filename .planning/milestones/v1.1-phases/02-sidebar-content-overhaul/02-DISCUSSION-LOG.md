# Phase 2: Sidebar & Content Overhaul - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 02-sidebar-content-overhaul
**Areas discussed:** Sidebar layout structure, Branding & description copy, Stream button behavior, Content removal scope

---

## Sidebar Layout Structure

| Option                            | Description                                                                                                                                                     | Selected |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Single stacked column             | One scrollable column: branding/description at top, weather section, stream button, then placeholder area for Phase 3 river data. Simple, no conditional swaps. |          |
| Fixed button + scrollable content | Stream button pinned to bottom of sidebar (sticky), branding and weather scroll above it. Guarantees button is always visible without scrolling.                | ✓        |
| You decide                        | Agent picks the best layout approach based on content volume and mobile constraints.                                                                            |          |

**User's choice:** Fixed button + scrollable content
**Notes:** None

---

| Option               | Description                                                                                                                        | Selected |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- |
| No conditional swaps | Same sidebar content regardless of stream state. Branding, weather, button — always there. Simpler code, less jarring transitions. | ✓        |
| Minimal state hints  | Same layout always, but show small contextual hints (e.g., "Live" badge near weather) based on phase.                              |          |
| You decide           | Agent determines what, if any, state-based content changes make sense.                                                             |          |

**User's choice:** No conditional swaps
**Notes:** None

---

| Option                | Description                                                             | Selected |
| --------------------- | ----------------------------------------------------------------------- | -------- |
| Fixed width, narrower | Pick one width (~320-340px). Narrower suits the reduced content volume. |          |
| Fixed width, wider    | Keep it around 400-420px. More breathing room.                          |          |
| You decide            | Agent picks the width based on content needs and mobile testing.        |          |

**User's choice:** Leave as-is (free text) — keep existing dual-width behavior (300px viewing, 420px otherwise)
**Notes:** User wants to preserve the existing width transition behavior.

---

| Option                | Description                                                                                       | Selected |
| --------------------- | ------------------------------------------------------------------------------------------------- | -------- |
| Same layout in drawer | Mobile drawer mirrors desktop: branding, weather, sticky button at bottom. Consistent experience. | ✓        |
| Simplified mobile     | Mobile drawer shows just the button + weather summary. No branding block.                         |          |
| You decide            | Agent determines the best mobile drawer approach.                                                 |          |

**User's choice:** Same layout in drawer
**Notes:** None

---

## Branding & Description Copy

| Option                 | Description                                                                                                                        | Selected |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Simple text header     | "Trask River Cam" in the existing display font, with "Tillamook, OR" subtitle. Clean, matches the header already in the main view. | ✓        |
| Branded with icon/mark | "Trask River Cam" with a small river/fish icon or custom mark alongside.                                                           |          |
| You decide             | Agent picks a clean branding treatment that matches the existing visual style.                                                     |          |

**User's choice:** Simple text header
**Notes:** None

---

| Option                    | Description                                                                                                | Selected |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| River context for anglers | Something like: "Live camera on the Trask River near Tillamook, OR. Check conditions before you head out." |          |
| Minimal — location only   | Just the name and location. No description paragraph.                                                      |          |
| I'll write the copy       | User provides specific copy.                                                                               |          |

**User's choice:** Free text — "River context but not too targeted towards anglers. Maybe mention that the river is known for its runs of Steelhead and Chinook salmon but otherwise keep it brief and general."
**Notes:** User wants the description to be general-purpose, mentioning the fish runs but not assuming the audience is exclusively anglers.

---

## Stream Button Behavior

| Option                          | Description                                                                 | Selected |
| ------------------------------- | --------------------------------------------------------------------------- | -------- |
| "Restart stream" during viewing | When stream is playing: show "Restart stream" as a secondary/subtle button. |          |
| Disabled with "Streaming" label | During viewing, button shows "Streaming" in a disabled/success state.       | ✓        |
| Hide during viewing             | Button visible in all phases except viewing.                                |          |
| You decide                      | Agent picks the best label/state approach.                                  |          |

**User's choice:** Disabled with "Streaming" label — users should not be able to restart stream unless it has ended
**Notes:** User explicitly wants to prevent restart during active viewing.

---

| Option          | Description                                                                                          | Selected |
| --------------- | ---------------------------------------------------------------------------------------------------- | -------- |
| Keep both       | Overlay buttons stay for quick action in the main area. Sidebar button provides redundant access.    | ✓        |
| Remove overlays | Remove restart buttons from the main area overlays. Sidebar is the single source for stream control. |          |
| You decide      | Agent determines whether overlay redundancy helps or hurts.                                          |          |

**User's choice:** Keep both
**Notes:** None

---

## Content Removal Scope

| Option            | Description                                                                                           | Selected |
| ----------------- | ----------------------------------------------------------------------------------------------------- | -------- |
| Delete entirely   | Remove PassDetailsPanel.svelte completely. All filler. Button logic moves to new sidebar layout.      | ✓        |
| Gut and repurpose | Keep the component file but strip all filler content. Repurpose as container for new sidebar content. |          |
| You decide        | Agent determines whether to delete or repurpose the component.                                        |          |

**User's choice:** Delete entirely
**Notes:** None

---

| Option                   | Description                                                                         | Selected |
| ------------------------ | ----------------------------------------------------------------------------------- | -------- |
| Remove it now            | Delete TelemetryFooter.svelte. Phase 3 will add river data components in its place. |          |
| Keep as placeholder      | Leave TelemetryFooter for now. Phase 3 replaces it.                                 | ✓        |
| Replace with simple stub | Remove tech telemetry, put a minimal placeholder.                                   |          |

**User's choice:** Keep as placeholder
**Notes:** User wants to avoid an empty spot at the bottom until Phase 3 fills it.

---

| Option        | Description                                                                  | Selected |
| ------------- | ---------------------------------------------------------------------------- | -------- |
| Clean up copy | Change "Local Telemetry" to "Current Weather". Remove "sensor array" jargon. | ✓        |
| Leave as-is   | Weather component copy is fine for now.                                      |          |
| You decide    | Agent cleans up any overly technical language across all sidebar components. |          |

**User's choice:** Clean up copy
**Notes:** None

---

## Agent's Discretion

- Exact branding description copy (guided by user's Steelhead/Chinook salmon direction)
- Weather component label rewording
- Sticky button CSS implementation
- Transition animation adjustments
- Mobile drawer overflow handling

## Deferred Ideas

None — discussion stayed within phase scope.
