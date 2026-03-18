# Roadmap: River Stream

## Proposed Roadmap

**3 phases** | **5 requirements mapped** | All v1 requirements covered ✓

| #   | Phase                         | Goal                                                                        | Requirements     | Success Criteria |
| --- | ----------------------------- | --------------------------------------------------------------------------- | ---------------- | ---------------- |
| 1   | Automated Auth (Skip Paywall) | Temporarily authenticate users automatically.                               | AUTH-01          | 1                |
| 2   | Serverless Media Streaming    | Move RTSP ingestion to a dedicated service, enabling Cloudflare deployment. | STRM-01, STRM-02 | 2                |
| 3   | Asset Security & Cleanup      | Ensure the HLS stream and test endpoints are secure for production.         | SEC-01, SEC-02   | 2                |

### Phase Details

**Phase 1: Automated Auth (Skip Paywall)**
Goal: Temporarily authenticate users automatically.
Requirements: AUTH-01
Plans: 1 plan

- [ ] 01-01-PLAN.md — Auto-issue subscription cookie and remove paywall UI
      Success criteria:

1. When a user visits the site, they automatically receive a valid HMAC signed session cookie without needing to complete a Stripe purchase.

**Phase 2: Serverless Media Streaming**
Goal: Move RTSP ingestion to a dedicated service, enabling Cloudflare deployment.
Requirements: STRM-01, STRM-02
Success criteria:

1. The local `ffmpeg` process (`scripts/stream.ts`) is removed or replaced with an external/hosted streaming solution.
2. The `VideoPlayer.svelte` component successfully loads the stream from the new external source instead of `static/stream/`.

**Phase 3: Asset Security & Cleanup**
Goal: Ensure the HLS stream and test endpoints are secure for production.
Requirements: SEC-01, SEC-02
Success criteria:

1. The `/api/test-access` endpoint is either removed or restricted (`if (!dev) throw error(404);`).
2. Raw HLS stream assets are no longer publicly accessible or are protected via signed URLs/edge tokens.

---

_Roadmap created: 2026-03-18_
