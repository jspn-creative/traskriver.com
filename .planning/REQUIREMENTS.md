# Requirements: River Stream

**Defined:** 2026-03-18
**Core Value:** Reliably deliver a continuous, high-quality livestream to authenticated users.

## v1 Requirements

### Authentication

- [x] **AUTH-01**: The application automatically authenticates users (skipping the paywall) and issues valid session cookies to view the stream.

### Streaming Infrastructure

- [x] **STRM-01**: Offload RTSP ingestion and HLS generation to a dedicated media streaming server/service, removing the local `ffmpeg` process from `scripts/stream.ts`.
- [x] **STRM-02**: The video player (`src/lib/components/VideoPlayer.svelte`) correctly points to the new, external HLS stream source.

### Security

- [ ] **SEC-01**: Secure the HLS stream assets so they cannot be accessed directly by unauthenticated users.
- [ ] **SEC-02**: Restrict or remove the `/api/test-access` endpoint for production.

## v2 Requirements

### Paywall

- **PAY-01**: Implement the final paywall logic (one-time purchase or subscription) based on the client's decision.
- **PAY-02**: Validate Stripe success session IDs to ensure they are single-use.
- **PAY-03**: Implement Stripe webhooks for full subscription lifecycle management (cancellations, failed payments, updates).

## Out of Scope

| Feature       | Reason                                                                             |
| ------------- | ---------------------------------------------------------------------------------- |
| User Database | Keeping authentication stateless; only necessary if the paywall model requires it. |

## Traceability

| Requirement | Phase   | Status   |
| ----------- | ------- | -------- |
| AUTH-01     | Phase 1 | Complete |
| STRM-01     | Phase 2 | Complete |
| STRM-02     | Phase 2 | Complete |
| SEC-01      | Phase 3 | Pending  |
| SEC-02      | Phase 3 | Pending  |

**Coverage:**

- v1 requirements: 5 total
- Mapped to phases: 5
- Unmapped: 0 ✓

---

_Requirements defined: 2026-03-18_
_Last updated: 2026-03-18 after initial definition_
