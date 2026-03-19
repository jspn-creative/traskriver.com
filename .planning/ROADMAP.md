# Roadmap: River Stream

## Milestones

- ✅ **v1.0 MVP** — Phases 1-3 (shipped 2026-03-19)
- 🔄 **v1.1 Signed URL Streaming** — Phase 4 (active)
- 📋 **v2.0 Paywall** — Phases 5+ (planned)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-3) — SHIPPED 2026-03-19</summary>

- [x] Phase 1: Automated Auth (1/1 plan) — completed 2026-03-18
- [x] Phase 2: Serverless Media Streaming (2/2 plans) — completed 2026-03-18
- [x] Phase 3: Asset Security & Cleanup (1/1 plan) — completed 2026-03-19

Full archive: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### 🔄 v1.1 Signed URL Streaming (Active)

- [ ] Phase 4: Signed URL Streaming — restore stream playback with CF Signed URLs + async page delivery (**3 plans**)

### 📋 v2.0 Paywall (Planned)

- [ ] Phase 5: TBD — implement final paywall logic once client decides on payment model

## Phase Details

### Phase 4: Signed URL Streaming

**Milestone:** v1.1
**Goal:** Restore stream playback by provisioning a Cloudflare Stream signing key, generating signed JWTs server-side, and delivering the page shell immediately while the player awaits the signed URL.

**Requirements:** SIGN-01, SIGN-02, SIGN-03, SIGN-04

**Plans:** 3 plans

Plans:

- [ ] 04-01-PLAN.md — Signing key provisioning script + env var documentation
- [ ] 04-02-PLAN.md — RS256 JWT generation + signed URL construction in stream.remote.ts
- [ ] 04-03-PLAN.md — Page shell restructure: nested VideoPlayer boundary, immediate sidebar/header render

**Success criteria:**

1. Stream plays successfully with "Require Signed URLs" enabled in CF dashboard
2. Signed HLS URL contains a JWT token (not the raw live input UID) in the manifest path
3. Token is generated server-side via Web Crypto API with no outbound CF API call per request
4. Page shell (header, sidebar, pass panel) renders immediately on load — no full-page "Preparing stream…" block
5. VideoPlayer shows its own pending state while the signed URL resolves, then begins playback

## Progress

| Phase                         | Milestone | Plans Complete | Status   | Completed  |
| ----------------------------- | --------- | -------------- | -------- | ---------- |
| 1. Automated Auth             | v1.0      | 1/1            | Complete | 2026-03-18 |
| 2. Serverless Media Streaming | v1.0      | 2/2            | Complete | 2026-03-18 |
| 3. Asset Security & Cleanup   | v1.0      | 1/1            | Complete | 2026-03-19 |
| 4. Signed URL Streaming       | v1.1      | 0/3            | Active   | —          |

---

_Roadmap updated: 2026-03-19 after v1.1 milestone start_
