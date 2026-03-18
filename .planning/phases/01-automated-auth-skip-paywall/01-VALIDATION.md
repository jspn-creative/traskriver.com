---
validation_phase: 01
validation_slug: automated-auth-skip-paywall
date: 2026-03-18
---

# Phase 01 Validation Strategy

## 1. Unit Tests

N/A - the logic is minimal and mostly framework routing.

## 2. Integration Tests

N/A.

## 3. End-to-End Verification

- Start the server (`npm run dev`).
- Open `http://localhost:5173` in a browser.
- Verify the video player is displayed immediately, without the test access button.
- Check the application cookies. A `subscription` cookie should exist.
- Delete the `subscription` cookie and reload the page. A new `subscription` cookie should be created and the player still visible.

## 4. Manual Verification Steps

- Launch server and navigate to root route.
- Confirm video player UI overrides the paywall interface immediately.
- Inspect network requests or cookies to verify `subscription` token was issued on load.
