---
phase: 260319-fit
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/routes/+page.svelte
  - src/lib/components/PassDetailsPanel.svelte
  - src/lib/components/LocalWeather.svelte
  - src/lib/components/TelemetryFooter.svelte
autonomous: true
requirements: []
must_haves:
  truths:
    - On mobile (<md), the sidebar does NOT render inline — it opens as a bottom drawer
    - On desktop (md+), the side-by-side layout is unchanged
    - All padding is comfortable on mobile (no px-12 at small screens)
    - The header/overlay gradient auto-hides after N seconds on touch devices (no permanent block)
    - The fullscreen touch target is at least 44×44px
  artifacts:
    - path: src/routes/+page.svelte
      provides: Responsive layout with drawer trigger on mobile, fixed group-hover touch issue
    - path: src/lib/components/PassDetailsPanel.svelte
      provides: Responsive padding (px-5 py-8 md:px-12 md:py-16)
    - path: src/lib/components/LocalWeather.svelte
      provides: Responsive padding (px-5 py-8 md:px-12 md:py-16)
    - path: src/lib/components/TelemetryFooter.svelte
      provides: Responsive padding (px-5 py-4 md:px-12 md:py-6)
  key_links:
    - from: src/routes/+page.svelte
      to: src/lib/components/ui/drawer/index.ts
      via: import Drawer components
      pattern: 'from.*ui/drawer'
    - from: src/routes/+page.svelte
      to: aside (desktop sidebar)
      via: hidden md:flex — invisible on mobile
      pattern: 'hidden md:'
---

<objective>
Make the layout fully mobile-responsive by wrapping the sidebar in vaul-svelte Drawer on mobile while keeping the desktop side-by-side layout intact. Fix all padding, the group-hover touch problem, and small touch target issues.

Purpose: The app currently overflows and is unusable on phones — the sidebar is fixed-width and there's no mobile reflow.
Output: A responsive layout where mobile users get a bottom drawer for sidebar content, desktop users see no change.
</objective>

<execution_context>
@/Users/jspn/Documents/Sites/river-stream/.opencode/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@src/routes/+page.svelte
@src/lib/components/PassDetailsPanel.svelte
@src/lib/components/LocalWeather.svelte
@src/lib/components/TelemetryFooter.svelte
@src/app.css

<interfaces>
<!-- Drawer component is already installed at src/lib/components/ui/drawer/ -->
<!-- vaul-svelte is in package.json devDependencies -->

From src/lib/components/ui/drawer/index.ts:

```typescript
export {
	Root as Drawer,
	Content as DrawerContent,
	Header as DrawerHeader,
	Title as DrawerTitle,
	Trigger as DrawerTrigger,
	Overlay as DrawerOverlay,
	Portal as DrawerPortal,
	Footer as DrawerFooter,
	Close as DrawerClose
};
```

DrawerContent direction defaults to "bottom" — renders a bottom sheet.
DrawerTrigger wraps any element as the open trigger.
DrawerContent has max-h-[80vh] built-in for bottom direction.
The `open` prop is bindable on the Root: `bind:open`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Responsive layout with mobile drawer trigger in +page.svelte</name>
  <files>src/routes/+page.svelte</files>
  <action>
Refactor +page.svelte to support both mobile and desktop layouts.

**Root layout:**

- Change `flex h-screen overflow-hidden` root div → add `flex-col md:flex-row` so on mobile it stacks vertically, on desktop stays side-by-side
- `<main>` keeps `flex-1 flex-col relative overflow-hidden` — on mobile it fills the full viewport height
- Reduce `p-10` on main → `p-4 md:p-10` for mobile breathing room

**Desktop sidebar (md+ only):**

- Keep existing `<aside>` but add `hidden md:flex` so it ONLY shows on desktop
- Remove the inline `style="width: {phase === 'telemetry' ? '300px' : '420px'}"` — replace with a Tailwind class approach: `class="... md:w-[300px] md:data-[phase=telemetry]:w-[300px]"` or use a $derived class binding. Simplest: use `class:` directive with a derived string: `class="hidden md:flex flex-col overflow-x-hidden overflow-y-auto border-l border-sepia bg-light shadow-[-10px_0_40px_rgba(0,0,0,0.04)] transition-[width] duration-900 ease-[cubic-bezier(0.16,1,0.3,1)] {phase === 'telemetry' ? 'w-[300px]' : 'w-[420px]'}"` and REMOVE the `style` attribute entirely

**Mobile drawer (below md):**

- Add `import { Drawer, DrawerContent, DrawerTrigger } from '$lib/components/ui/drawer'` to script
- Add `let drawerOpen = $state(false)` to track drawer state
- Below `</main>`, add `<div class="md:hidden">` wrapping a `<Drawer bind:open={drawerOpen} direction="bottom">` block
- Inside the Drawer, add `<DrawerTrigger asChild>` — the trigger should be a floating pill button fixed at the bottom of the screen on mobile. Place it inside main with `absolute bottom-4 left-1/2 -translate-x-1/2 z-20 md:hidden`:
  ```svelte
  <button
  	class="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-sepia bg-light/90 px-5 py-2.5 text-xs font-medium tracking-ui text-primary shadow-md backdrop-blur-md md:hidden"
  	onclick={() => (drawerOpen = true)}
  >
  	<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
  		<path
  			stroke-linecap="round"
  			stroke-linejoin="round"
  			d="M9 5l7 7-7 7"
  			transform="rotate(-90 12 12)"
  		/>
  	</svg>
  	{phase === 'telemetry' ? 'Conditions' : 'View Pass'}
  </button>
  ```
- The `<Drawer bind:open={drawerOpen}>` wraps `<DrawerContent class="bg-light border-sepia max-h-[85vh] overflow-y-auto">` which renders the same sidebar content (phase-conditional LocalWeather vs PassDetailsPanel, and TelemetryFooter)

**Fix group-hover touch issue:**

- The header and gradient overlay use `group-hover:opacity-0` — on touch devices hover never fires so they stay permanently visible, blocking the video
- Solution: Add a `headerVisible` state that auto-hides after 3s on touch. Add to script:

  ```typescript
  let headerVisible = $state(true);
  let hideTimer: ReturnType<typeof setTimeout>;

  const resetHideTimer = () => {
  	clearTimeout(hideTimer);
  	headerVisible = true;
  	hideTimer = setTimeout(() => {
  		headerVisible = false;
  	}, 3000);
  };

  $effect(() => {
  	if (sessionActive) resetHideTimer();
  	return () => clearTimeout(hideTimer);
  });
  ```

- On the `<main>` element, add `ontouchstart={resetHideTimer}` handler
- Change the header's opacity binding from `group-hover:opacity-0` to a combined class that checks both: `{sessionActive ? (headerVisible ? 'opacity-100' : 'opacity-0 pointer-events-none') : ''}` — removing the `group-hover:opacity-0` entirely
- Similarly update the gradient overlay `div` that uses `group-hover:opacity-0` — replace with the same `headerVisible` reactive logic
- Keep the `group` class on `<main>` for backward compat but the hover part is replaced by JS-driven visibility
- On desktop (non-touch), `mousemove` on `<main>` should also call `resetHideTimer`: add `onmousemove={sessionActive ? resetHideTimer : undefined}`

**Fix min-w classes:**

- Inside the phase-conditional fade wrappers in the desktop `<aside>`, change `min-w-[420px]` → `min-w-0` and `min-w-[300px]` → `min-w-0` (the parent `<aside>` width is now set via Tailwind class, not inline style)
  </action>
  <verify>
  <automated>bun run check 2>&1 | tail -20</automated>
  </verify>
  <done> - On mobile viewport (&lt;768px): sidebar is not visible; a "View Pass" / "Conditions" pill button appears at bottom of screen; tapping it opens a bottom drawer with full sidebar content - On desktop (≥768px): side-by-side layout unchanged, aside shows at correct width, no inline style attribute - Header and gradient auto-hide 3s after last touch/mouse interaction when sessionActive=true - TypeScript check passes with no errors
  </done>
  </task>

<task type="auto">
  <name>Task 2: Responsive padding in PassDetailsPanel, LocalWeather, TelemetryFooter</name>
  <files>
    src/lib/components/PassDetailsPanel.svelte
    src/lib/components/LocalWeather.svelte
    src/lib/components/TelemetryFooter.svelte
  </files>
  <action>
Fix oversized padding across all three sidebar content components so they're comfortable on the smaller viewport of a mobile drawer.

**PassDetailsPanel.svelte:**

- Line 26: `px-12 py-16` → `px-5 py-8 md:px-12 md:py-16`

**LocalWeather.svelte:**

- Line 45 (the outer div): `px-12 py-16` → `px-5 py-8 md:px-12 md:py-16`

**TelemetryFooter.svelte:**

- Line 1: `px-12 py-6` → `px-5 py-4 md:px-12 md:py-6`

These three changes ensure that when the sidebar renders inside the mobile drawer (which has its own horizontal constraints), the inner content doesn't have massive padding consuming the available space. On desktop ≥md, the original generous padding is restored.
</action>
<verify>
<automated>bun run check 2>&1 | tail -10</automated>
</verify>
<done>
All three components have responsive padding classes. No `px-12` or `py-16` at bare (mobile-first) scale — only at `md:` breakpoint and above. TypeScript check passes.
</done>
</task>

</tasks>

<verification>
After both tasks:
1. `bun run check` passes with 0 errors
2. `bun run build` completes successfully
3. Manual: resize browser to 375px wide — sidebar `<aside>` is hidden (display:none), floating pill button visible at bottom
4. Manual: tap the pill → vaul bottom drawer slides up with pass details or weather content
5. Manual: at 768px+ wide — desktop layout unchanged, side-by-side, no pill button visible
6. Manual: in connected/telemetry phase on touch — header text fades after ~3s inactivity, reappears on tap
</verification>

<success_criteria>

- No horizontal overflow on 375px mobile viewport
- Sidebar content accessible via bottom drawer on mobile
- Desktop layout pixel-identical to pre-change behavior
- `bun run build` exits 0
  </success_criteria>

<output>
No SUMMARY.md needed for quick plans.
</output>
