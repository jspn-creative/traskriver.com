# Pitfalls Research — v1.2 Self-Hosted HLS Origin (`packages/stream`)

**Domain:** Adding an always-on RTSP→HLS Node service to a production viewer app, routed through a generic CDN (Cloudflare), with an IP camera exposed directly to the public internet via DDNS + port-forward.
**Researched:** 2026-04-20
**Confidence:** HIGH for Cloudflare ToS (primary sources dated 2025-09-12 and 2026-03-24), HIGH for ffmpeg/HLS reconnect/discontinuity patterns (matches STACK.md findings), HIGH for IP camera CVE landscape (CISA KEV + 2025 advisories), MEDIUM for home-network/CGNAT specifics (user-owned infra, assumptions stated).

---

## Severity scale (for a ~50-peak-viewer hobby stream)

| Severity     | Meaning in this project                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| **CRITICAL** | Causes outage, data loss, stream takedown, or legal/ToS breach with hours-to-days to recover. Block cutover on this. |
| **HIGH**     | Viewer-visible bad experience or silent security exposure. Fix in the phase that introduces the surface.             |
| **MEDIUM**   | Observable degradation or accruing ops cost. Fix within the milestone, not necessarily in the introducing phase.     |
| **LOW**      | Polish / future scale / paper cut. Document now, fix opportunistically.                                              |

Phase references map to the Build Order in `ARCHITECTURE.md` §"Build Order":

- **P0** pre-phase decision (CF ToS path)
- **P1** stream skeleton • **P2** supervisor • **P3** /health • **P4** shared types
- **P5** VPS + DNS + CF rules • **P6** DDNS + port-forward + camera config
- **P7** E2E smoke • **P8** web swap (flag) • **P9** state-machine collapse + deletions
- **P10** cutover • **P11** observation • **P12** decommission

---

## Critical Pitfalls

### Pitfall 1: Cloudflare ToS — serving video through the CDN on a Free/Pro/Business plan

**Severity:** **CRITICAL** (milestone-level blocker, not a bug to fix in code)

**What goes wrong:**
Cloudflare actively redirects non-Stream video traffic on Free/Pro/Business plans. Your `stream.traskriver.com` manifest and segment requests stop returning your content; viewers see a canned "This Video has been restricted. Streaming video from Cloudflare basic service is a violation of the Terms of Service" message. In extreme cases Cloudflare warns then limits account-wide access.

**Why it happens:**
Old "Section 2.8" of the Self-Serve Subscription Agreement was retired in May 2023, but the restriction did not go away — it was moved into the **Service-Specific Terms → "Content Delivery Network (Free, Pro, or Business)"** section. Current wording (verified 2026):

> "Cloudflare's content delivery network (the 'CDN') Service can be used to cache and serve web pages and websites. Unless you are an Enterprise customer, Cloudflare offers specific Paid Services (e.g., the Developer Platform, Images, and Stream) that you must use in order to serve video and other large files via the CDN. Cloudflare reserves the right to disable or limit your access to or use of the CDN … if you use or are suspected of using the CDN without such Paid Services to serve video or a disproportionate percentage of pictures, audio files, or other large files."
> — Cloudflare Service-Specific Terms, last updated **2026-03-24**

The existing `Delivering Videos with Cloudflare` guidance (Cloudflare Fundamentals docs, current as of 2026) confirms enforcement is by automated detection plus email notification, and that the only fully-compliant paths on non-Enterprise plans are:

1. **Cloudflare Stream** (the thing we are leaving)
2. **R2** or **Images** hosted by Cloudflare (video served from Cloudflare service, can then be CDN-cached)
3. **Grey-cloud (DNS-only) the video subdomain** so the CDN is not in the path at all (explicitly documented by Cloudflare community + staff as the supported self-help fix)

Enforcement pattern (community evidence, HIGH confidence as a pattern, MEDIUM confidence on exact trigger thresholds):

- Trigger is **ratio** of non-HTML bytes vs HTML bytes on your zone, not absolute GB. A subdomain that is 100% HLS is a high-signal target regardless of total traffic.
- Enforcement starts with an email to the account owner → content redirect → in stubborn cases, wider limits.
- Detection reportedly happens within days to a few weeks once traffic crosses an internal threshold; not seconds.
- A ~50-peak-viewer cam with 3–6 Mbps HLS (300 Mbps peak aggregate behind CF) is **small by CF standards** but the subdomain-pure-video pattern is what the detector keys on. This is not hypothetical; the CF community forum has years of first-hand reports including self-hosted HLS setups of our exact shape.

**Consequences if we ignore:**
Viewer outage on a detection event. Recovery requires either migrating origin (24–72h of work) or grey-clouding (5 min, but loses DDoS shield and reveals VPS public IP). Account-level repercussions are rare for a single-zone violator but not zero.

**How to avoid — RECOMMENDATION (in order of preference):**

| Path                                                                                                                | Cost                                                                                                                        | Compliance                                       | Our setup impact                                                                                                                                                                                                                     | Verdict                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) Grey-cloud `stream.traskriver.com` (DNS-only)**                                                               | $0                                                                                                                          | ✅ Explicitly supported by CF guidance           | VPS IP public; VPS serves all viewer egress (~300 Mbps peak); no edge cache; ~50 concurrent viewers × 4 Mbps = 200 Mbps sustained — feasible on a decent VPS NIC but ~540 GB/month egress at steady state. Watch VPS bandwidth plan. | **PRIMARY. Simplest and cheapest. The only unambiguously compliant zero-cost path.**                                                               |
| (b) Bunny.net CDN in front of VPS origin                                                                            | ~$1–5/month at this scale (verified bunny.net pricing 2026-04: EU/NA $0.010/GB standard or $0.005/GB volume, $1/mo minimum) | ✅ Bunny.net explicitly allows video traffic     | Swap one DNS record + set `Cache-Control` headers identically to our CF plan; no code change; keeps edge caching.                                                                                                                    | **RECOMMENDED if (a) shows viewer-side latency or egress pain.** Bunny.net is the industry-standard "CDN for people who left CF Stream".           |
| (c) R2-backed origin (MediaMTX `runOnSegmentComplete` → R2 upload; m3u8 rewritten to R2 URLs or served by a Worker) | R2 egress to Cloudflare is $0; R2 storage ~$0.015/GB; requires code in `packages/stream` to push each segment               | ✅ Explicitly compliant (R2 = Cloudflare-hosted) | +100–200 LOC supervisor work; new failure mode (R2 push latency); loses "tmpfs-only" simplicity                                                                                                                                      | Fallback only. Adds surface; don't build first.                                                                                                    |
| (d) Cloudflare Stream                                                                                               | $5/mo base + $1/1000 minutes delivered                                                                                      | ✅ Obviously                                     | Reverts the v1.2 decision                                                                                                                                                                                                            | **Non-starter** — milestone is explicitly to leave Stream.                                                                                         |
| (e) Enterprise plan                                                                                                 | $thousands/mo                                                                                                               | ✅                                               | Absurd for a hobby cam                                                                                                                                                                                                               | **Non-starter.**                                                                                                                                   |
| (f) Orange-cloud and hope                                                                                           | $0                                                                                                                          | ❌ ToS violation                                 | Works until it doesn't                                                                                                                                                                                                               | **Do not do this.** The "small hobby" argument has no protective weight in CF's enforcement model — the detector is ratio-based, not volume-based. |

**Chosen path:** **(a) grey-cloud**, with **(b) Bunny.net** documented as the pre-validated escape hatch if grey-clouding causes viewer pain. This overrides the orange-cloud assumption in the current STACK.md and ARCHITECTURE.md — those documents must be updated as part of P5 (or P0) before any cache-rules work begins.

**Implications for the architecture:**

- **DDoS shield is lost** on a grey-cloud. Mitigate by: CF rate-limiting rule at the zone apex is inapplicable; instead, MediaMTX's own connection limits (`hlsMaxReaders: 200`) and VPS-level `iptables`/`nftables` drop rules are the new floor. Document this in `packages/stream/README.md`.
- **VPS IP is public.** Required anyway for camera-to-VPS; camera doesn't go through CF. Tailscale-only `/health` binding (ARCHITECTURE.md already says this) still applies. No regression.
- **Cache-rules section of ARCHITECTURE.md is moot under grey-cloud.** Keep the `Cache-Control` headers correct at the origin anyway (Path b or c may reinstate a CDN later without a code change).

**Warning signs (before detection):**

- Email from `abusereply@cloudflare.com` or `trustandsafety@cloudflare.com` — read and act within 24h, never "try to evade the redirect" (explicit CF guidance; doing so invites wider limits).
- Sudden HTTP 403s with HTML body containing "This Video has been restricted".

**Phase to address:** **P0** (before any work starts). A milestone-level call. If the user picks grey-cloud, P5 drops the cache-rules subtask entirely. If Bunny.net, P5 replaces CF config with Bunny pull-zone config.

---

### Pitfall 2: RTSP reconnect loops — tight retry + stall-blindness

**Severity:** **HIGH**

**What goes wrong:**
Four independent failure modes bundled under one banner:

1. **Tight reconnect loop.** Supervisor respawns ffmpeg/MediaMTX immediately on exit. Camera sees a reconnect storm, drops further, and the loop amplifies.
2. **No exponential backoff.** Every network blip turns into a spike in camera CPU and router NAT table churn. With TP-Link Deco mesh this sometimes wedges the whole LAN.
3. **Stuck ffmpeg / zombie TCP.** Process is "running" (TCP connection open), but packets have stopped flowing. Exit handler never fires. Supervisor reports healthy. No segments are being produced. Viewer sees a frozen stream.
4. **GOP misalignment after reconnect.** New session starts mid-GOP; first emitted segment begins on a P-frame not an I-frame; player can't start decoding → perceived 10–30s stall even after reconnect "succeeds".

**Why it happens:**
The relay's existing `FfmpegManager` in `packages/relay/src/ffmpeg.ts` already encodes lessons on three of the four: it has a **stderr-activity watchdog** (`HEALTH_STALL_TIMEOUT_MS = 320_000`, SIGKILLs on silence), exit callbacks, and kill-fallback timer. It does **not** have exponential backoff — that lives in the state-machine layer above it. A naive port of `ffmpeg.ts` into `packages/stream` without the backoff layer will regress. The 320 s stall threshold was tuned for the _on-demand_ + 5-min-demand-window model and is **too long for always-on**; a 60–90 s stall threshold fits the new context (no viewer is waiting for "warm-up" forgiveness).

**How to avoid:**

- **Supervisor.ts backoff schedule:** 1s → 2s → 4s → 8s → 16s → 30s cap. Reset to 1s on 60s clean uptime. Matches STACK.md §"Process Supervision Pattern".
- **Stall watchdog on `packages/stream`:** port `ffmpeg.ts`'s `lastStderrActivity` pattern, but use **MediaMTX's `/v3/paths/get/trask`** (`ready: true` + `bytesReceived` advancing) as the primary liveness signal, with stderr silence as a secondary tripwire. Threshold: 3 consecutive probes `ready: false` OR `bytesReceived` unchanged across 3× 30 s probes (= 90 s total, not 320 s). On tripwire, kill MediaMTX child; supervisor restart + backoff takes over.
- **Camera GOP = segment duration.** Camera must be configured for a **fixed GOP of 2 s (60 frames at 30 fps or 50 at 25 fps)** with closed GOP. This makes every RTSP reconnect resume on a keyframe boundary within at most 2 s, so the first new HLS segment is decodable. This is a camera-side setting, not a server flag — document in `packages/stream/README.md` and the "Camera checklist" table in ARCHITECTURE.md.
- **`EXT-X-DISCONTINUITY` on every reconnect.** MediaMTX emits this automatically on muxer restart (verify with a deliberate `systemctl restart stream` during smoke test P7). For raw-ffmpeg fallback: `-hls_flags append_list+discont_start+delete_segments+program_date_time`.
- **Reconnect is tested, not assumed.** P7 (E2E smoke) must include two explicit reconnect scenarios: (a) unplug camera PoE for 30s and confirm viewer recovers, (b) `systemctl restart stream` during active playback and confirm viewer recovers within 8–12s. Make these checklist items in the P7 plan.

**Warning signs:**

- `/health` shows `restartsLast1h > 6` (baseline is 0; any real value indicates the camera or link is flaky — should be investigated, not tolerated).
- `journalctl -u stream` repeats "MediaMTX spawn" at sub-5s intervals → backoff not working.
- Stream visible but segment index (`#EXT-X-MEDIA-SEQUENCE`) not advancing → stall-watchdog not tripping.

**Phase to address:** **P2** (supervisor) for backoff + stall watchdog. **P6** (camera config) for GOP. **P7** (smoke) for verification.

---

### Pitfall 3: HLS discontinuity + segment-numbering mistakes on origin or camera restart

**Severity:** **HIGH**

**What goes wrong:**

1. **Missing `EXT-X-DISCONTINUITY` after origin restart** → PTS jump confuses the decoder → hls.js reports `bufferAppendError` → player stalls and won't recover without a full remount.
2. **Segment counter resets to 0 on restart** while segments from before are still cached at the CDN → client sees `segment_5.ts` now referring to different content than 5 minutes ago → corrupted playback or decoder errors.
3. **Segments deleted from disk before the playlist window has rolled past them** → in-flight client `GET /segment_N.ts` returns 404 → hls.js fatal error.
4. **Playlist window shrunken on restart** → client that cached an older manifest requests segment numbers no longer in the new manifest → 404 cascade.

**Why it happens:**
MediaMTX handles (1) and (2) correctly out-of-the-box (emits DISCONTINUITY on muxer restart; uses monotonically increasing numbering via internal counter that persists for as long as the process lives). But **MediaMTX restarts in our supervisor model reset the counter** — the Node supervisor kills and respawns the MediaMTX child, so a new process starts from segment 0 unless configured otherwise. Combined with segment files cached at the CDN for 24h (`immutable`), this is a **cache-poisoning-by-restart** foot-gun.

**How to avoid:**

- **Segment filename contains a startup-epoch prefix.** Either (a) configure MediaMTX's `hlsSegmentFilename` pattern to include a boot-unique token (e.g. a 6-hex random suffix generated by the supervisor and passed in via the rendered `mediamtx.yml`), or (b) if MediaMTX doesn't support arbitrary filename patterns, rely on MediaMTX's per-session UUIDs in the generated paths. **Verify MediaMTX v1.17.1 segment naming behavior in P2** (read its docs or observe in staging) before deciding. If (a) is unavailable and (b) doesn't produce unique names across restarts, fall back to the ffmpeg spawn path with `-hls_segment_filename 'seg_%Y%m%d%H%M%S_%d.ts'` which is guaranteed-unique.
- **Playlist TTL must be ≤ segment duration / 2.** STACK.md and ARCHITECTURE.md already specify 1 s m3u8 TTL with 2 s segments — preserve this in P5's cache config (whether at CF, Bunny, or none-at-all).
- **`EXT-X-DISCONTINUITY` propagation is tested**, not assumed. Part of P7 smoke test: restart origin during active playback, verify `#EXT-X-DISCONTINUITY` appears in the manifest, verify hls.js logs `LEVEL_LOADED` with `discontinuity: true`, verify playback resumes within buffer window.
- **Segment retention on disk ≥ playlist-window × 2.** MediaMTX's default is adequate (`hlsSegmentCount: 7` with automatic deletion after the window rotates past). Do not manually delete or run a cron cleanup; let MediaMTX manage it.
- **Client-side remount is a last resort, not a primary strategy.** The current `VideoPlayer.svelte` has a 10 s remount on fatal errors; retain it, but an origin-side fix means it should rarely fire. If remount fires > 1×/hour in production, treat it as a P1-severity bug in origin.

**Warning signs:**

- hls.js console emits `MANIFEST_PARSING_ERROR` or `FRAG_PARSING_ERROR` clusters immediately after a restart.
- Viewer reports "blank player, no error UI" right after a deploy.
- `curl stream.traskriver.com/trask/index.m3u8 | grep DISCONTINUITY` returns empty lines in the 30 s window after a restart.

**Phase to address:** **P2** (supervisor: startup-epoch filename or verified-unique naming). **P7** (smoke: restart-during-playback test).

---

### Pitfall 4: Cloudflare (or Bunny) cache stampede + cache poisoning on HLS

**Severity:** **HIGH** (downgraded to **MEDIUM** if we grey-cloud per Pitfall 1 and no CDN sits in front)

**What goes wrong:**

1. **m3u8 cached too long** → on camera restart, every viewer sits on a stale manifest for minutes pointing at segments the origin may have already rotated out → mass 404 cascade.
2. **Segments cached too short** → viewer spikes hit the origin directly → upload saturates → everyone drops.
3. **Cache not split by query-string / Range** → if hls.js sends `?_HLS_msn=...` LL-HLS style hints or any range request, CF may return a mismatched cached variant. Vidstack + hls.js 1.5+ can emit byte-range requests for fMP4. On TS segments we use, this is not triggered — but it's easy to accidentally re-enable.
4. **Stale-while-revalidate / SWR** on a **live** manifest → the whole point of SWR is "serve stale while revalidating", which means clients see a ~1 manifest-generation-old playlist forever. Kills live playback.

**Why it happens:**
Default Cloudflare Cache Rules try to be helpful; a rule of "Cache Everything, TTL 4 hours" applied at the zone and not overridden on `*.m3u8` is the classic mistake. CF also has a "Stale-while-revalidate" toggle in the dashboard that's invisible unless you look.

**How to avoid (applies to CF if we ever go orange-cloud, or Bunny Pull Zone, or any generic CDN):**

- **Explicit origin headers, not CDN UI toggles:**
  ```
  # Manifests
  Cache-Control: public, max-age=1, s-maxage=1
  CDN-Cache-Control: public, max-age=1
  # Segments
  Cache-Control: public, max-age=86400, immutable
  CDN-Cache-Control: public, max-age=86400, immutable
  Access-Control-Allow-Origin: *
  ```
  Set these at MediaMTX's HLS server (verify via `curl -I` during P7). If MediaMTX can't emit them, front MediaMTX with a tiny nginx/caddy that sets headers by path.
- **No stale-while-revalidate on `*.m3u8`** anywhere in the pipeline. Unset in CF dashboard; Bunny disables per-rule.
- **Do NOT cache by query string** for HLS. Manifests and segments are path-addressed.
- **Vary: Accept-Encoding, Origin** at most. `Vary: *` blows cache hit rate; `Vary: Cookie` is a common misconfiguration that guts segment caching.
- **Disable CF Auto Minify, Rocket Loader, Mirage, Polish, Email Obfuscation** on the HLS hostname, as already noted in ARCHITECTURE.md. Under grey-cloud this is moot, but write the Configuration Rule anyway in case orange-cloud is reinstated.

**Grey-cloud caveat:** if Pitfall 1's chosen path is grey-cloud, none of the CDN cache concerns apply because there is no CDN — but this also means **viewer egress is VPS-to-every-viewer**. The stampede risk moves from CDN-miss to VPS-NIC-saturation. At 50 peak viewers × 5 Mbps = 250 Mbps; most VPS plans handle 1 Gbps NICs but watch egress billing.

**Warning signs:**

- `curl -I stream.traskriver.com/trask/index.m3u8` returns `cf-cache-status: HIT` with an `age:` value > 2. The TTL is 1 s; if you see age > 2 in a proxied response, the rules aren't applied.
- Viewer reports "stream was fine, then suddenly 404s everywhere" right after an origin restart.
- Origin 95th-percentile RPS spikes during viewer load events (you can see this in systemd logs / fastify access logs if you enable them).

**Phase to address:** **P5** (VPS + CDN config) — and make header verification a concrete P7 smoke checklist item.

---

### Pitfall 5: Port-forward + DDNS exposes the camera's admin UI or weak credentials

**Severity:** **CRITICAL** (security)

**What goes wrong:**

1. **Multiple ports forwarded "to make the web UI reachable from outside".** Forwarding port 80 or 443 of the camera alongside RTSP exposes the admin panel directly to the public internet. Credential brute-force + known-CVE exploit tooling is widely available (see CVEs below).
2. **Default credentials left in place.** `admin:admin`, `admin:888888`, `admin:12345`, `666666:666666` — standard Dahua/Hikvision/Xiongmai defaults that public exploit scripts try automatically. `dahua_exploit.py` from the `umair-aziz025/dahua-cve-research` repo explicitly cycles through these.
3. **Unpatched firmware with known CVEs.** The 2026 landscape is alarming:
   - **CVE-2021-33044 / 33045** (Dahua) — CVSS 9.8, in **CISA KEV (actively exploited in the wild)**. Empty-password-hash auth bypass over `/RPC2_Login`. Affects IPC-HUM7xxx, IPC-HX3xxx/HX5xxx, NVR/DVR/XVR/VTO/VTH lines. Firmware < 4.001.x.210709. If the camera is in this family and hasn't been updated since 2021, it is trivially remote-compromisable.
   - **CVE-2025-31700 / 31701** (Dahua, 2025) — CVSS 8.1, buffer overflow via oversized RPC2 packet, DoS guaranteed, RCE possible on no-ASLR builds.
   - **CVE-2025-65857** (Xiongmai XM530 + rebrands: ANBIUX and "hundreds of OEM rebrands") — CVSS 9.1, hardcoded RTSP password `2MNswbQ5` exposed via ONVIF GetStreamUri. **Changing the admin password does not fix this.** Firmware V5.00.R02.\* affected. No patch as of disclosure (Dec 2025).
   - **CVE-2025-66176 / 66177** (Hikvision, 2026-01) — CVSS 8.8, stack overflow in device discovery. **LAN-adjacent only**, so the public port-forward doesn't widen this exposure — but if the VPS is ever considered "local" to the camera (via VPN/Tailscale from the home router, for example), it re-enters scope.
4. **DDNS provider takeover.** Attacker signs up for the same DDNS hostname (on a sloppy DDNS provider), racing or exploiting account-expiry to point it at their own server. Supervisor happily connects to a hostile RTSP source feeding crafted packets → Pitfall 9 territory (codec exploits in ffmpeg/MediaMTX).
5. **Firmware update breaks RTSP compat.** Known pattern on Hikvision and generic OEMs: a security update silently changes the RTSP URL template (e.g. `/Streaming/Channels/101` → `/Streaming/Channels/1/live`) or forces digest auth. Service starts failing 30 days after a successful smoke test.

**Why it happens:**
The camera is shipped with "easy mode" defaults; IP-camera setup tutorials universally tell users to "forward ports for remote access"; firmware pages are hard to find; DDNS is treated as set-and-forget. The RTSP hostname + credentials end up in the VPS config, which lives for years while the threat landscape under it shifts weekly.

**How to avoid — concrete checklist:**

- **Port forwarding: ONLY 554/tcp (RTSP) to camera LAN IP. Never port 80, 443, 8000, 8443, 37777 (Dahua), or any ONVIF/CGI port.** If remote admin is desired, route through Tailscale to the LAN (camera is Tailscale-unaware, so put the Tailscale node on the router or a Pi on the same LAN). ARCHITECTURE.md already mandates this; upgrade to a firm "if any non-554 port is forwarded, stream service refuses to start" warning in `packages/stream/README.md`.
- **UPnP disabled on the router.** UPnP allows the camera to silently re-forward its own admin port. Document as a P6 precondition.
- **RTSP-only user with minimum privileges.** Most cameras support distinct admin and stream users. Create an RTSP user with "Live View" + "Playback" only, nothing else. Put its credentials in VPS env as `CAM_USER` / `CAM_PASS`. Rotate on any suspicion of exposure.
- **Strong RTSP password: 20+ char, unique, not reused from the admin password.** Store in a password manager. The camera UI may cap at 16 or 32 chars — document the actual limit the camera enforces.
- **Firmware recorded, known-good version pinned in README.** `cam/FIRMWARE.md` with current version + date + checksums + release notes diff from the previous version. Check vendor advisory every 90 days or on any CVE news.
- **CVE pre-flight at P6:** Before cutover, confirm the camera model + firmware is not listed in CVE-2021-33044/45, CVE-2025-31700/31701, CVE-2025-65857, CVE-2025-66176/66177. If it is, either patch before cutover or abort the milestone (the camera was already exposed on the current CF Stream path in some respects, but direct RTSP exposure is a step up in attack surface).
- **DDNS provider choice:**
  - ✅ Built-in DDNS on major brands (Cloudflare — see caveat, Dynu, DuckDNS with reserved-name-locks, No-IP paid tier) with MFA on the DDNS account.
  - ❌ Sketchy free DDNS services with no account recovery policy.
  - Specifically: **do NOT use Cloudflare DNS API-based DDNS for the camera hostname** if the camera cert validation will trip on Cloudflare proxying. For our setup, the DDNS hostname is the RTSP source (e.g. `cam.ddns.example`) and never touches a TLS layer — DDNS provider is free to be anything sensible.
- **Supervisor does NOT auto-trust the DDNS resolution.** Option: pin the expected TLS cert fingerprint when using RTSPS, or add a boot-time `dig`-based resolution sanity check that the resolved IP falls within the user's ISP prefix (roughly — document as nice-to-have). MVP: accept DDNS takeover as a MEDIUM residual risk and alert on "RTSP frame rate dropped to 0 after resolution changed" (stall watchdog catches this).
- **Reference Pi setup as the "hardening-done-right" template.** The current relay runs on a Pi inside the LAN; no camera port-forward exists at all today. v1.2 is the first time the camera is publicly reachable. Treat this as net-new threat surface, not a config migration.

**Warning signs:**

- `ss -tnp | grep :554` on the router's public IP (from outside the LAN, via an external scanner like `nmap -p 554`) returns anything other than `filtered` when the stream service is NOT running. If it's open when supervisor is off, something else is listening — investigate immediately.
- `/var/log/auth.log` on the VPS shows sudden SSH attempts from IPs in the camera's ISP's range (attacker pivoted from camera to VPS via known RTSP IP).
- Camera's own log (if accessible via LAN) shows failed login attempts from non-VPS IPs.

**Phase to address:** **P6** (DDNS + port-forward + camera config). Make the CVE pre-flight check and port-limit verification explicit P6 exit criteria. Blocker for P7.

---

## High-Severity Pitfalls

### Pitfall 6: Always-on ffmpeg/MediaMTX process leaks (memory, FDs, disk)

**Severity:** **HIGH**

**What goes wrong:**

1. **Memory leak over weeks.** ffmpeg 7.x has known slow-leak patterns when the RTSP source restarts hundreds of times (each reconnect allocates some state that isn't always freed). MediaMTX is Go and RSS is bounded, but over 30+ days of uninterrupted operation, its Go heap can drift upward on long-running pressure.
2. **FD exhaustion.** Rapid segment rotation + tmpfs + log pipes + HTTP clients can eat FDs. Default Linux ulimit `1024` hit in pathological cases.
3. **Disk fill.** Journald logs at default settings grow without bound; segment files on a non-tmpfs path persist across restarts. systemd's own `SystemMaxUse` default is "10% of /var/log partition" which sounds fine until the VPS has a 10 GB disk.
4. **systemd restart loop on bad config.** `Restart=always` + a MediaMTX config syntax error = a process that starts, errors out in 1 s, restarts, errors out — forever. systemd has `StartLimitBurst` defaults but if not tuned, you end up burning CPU instead of alerting.
5. **TLS cert expiry on VPS (only matters under orange-cloud with Full Strict — not under grey-cloud Path (a)).** 90-day Let's Encrypt renewal fails silently → CF origin fetches start failing 24h after expiry with 526 errors.

**How to avoid:**

- **systemd unit resource limits:**
  ```ini
  [Service]
  Restart=always
  RestartSec=5
  StartLimitIntervalSec=300
  StartLimitBurst=10         # after 10 restarts in 5 min, stop and alert
  MemoryMax=1G
  TasksMax=200
  LimitNOFILE=65536
  SystemCallFilter=@system-service
  RuntimeDirectory=stream    # auto-creates + cleans /run/stream
  ```
  Bake into `config/stream.service` in `packages/stream`.
- **Journald log retention:**
  ```ini
  # /etc/systemd/journald.conf.d/stream.conf
  SystemMaxUse=500M
  SystemKeepFree=2G
  MaxRetentionSec=1month
  ```
- **Supervisor emits a weekly `restart-count` metric via pino.** Any week with `> 200` restarts is worth investigating even if stream never went viewer-visible-down.
- **HLS segments on tmpfs (ARCHITECTURE.md already specifies this).** Declared via systemd `RuntimeDirectory=stream` so lifecycle is tied to the service. Size: 256M tmpfs (ample per ARCHITECTURE.md §"HLS files on disk").
- **Uptime-rotation cron (belt-and-suspenders).** `systemctl restart stream` once every 14 days at 03:00 local, when no viewers are expected, to short-circuit any slow leak. Pair with the `EXT-X-DISCONTINUITY` verification in P7 so the planned restart is visually covered by the "graceful restart" UX.
- **Cert auto-renewal watchdog (only if orange-cloud).** `certbot renew` in a systemd timer, with `deploy-hook` that reloads MediaMTX. Add `systemd-timesyncd` sanity check — certbot silent-fails if system clock drifts.
- **Boot-time config validation.** Render `mediamtx.yml` with `scripts/render-config.ts`, then run `mediamtx -conf mediamtx.yml -validate` (if available in v1.17.1; otherwise parse with a YAML linter) before `systemctl start stream`. A bad config caught pre-start avoids `StartLimitBurst` pain.

**Warning signs:**

- `systemctl status stream` shows `Restart count: N` climbing > 1/day baseline.
- `df -h /var/log` nearing 80% with no cleanup job.
- `lsof -p $(pgrep -f mediamtx) | wc -l` over 500 (baseline is ~20–40).
- `systemctl` reports "Start request repeated too quickly" → bad config, not a race.

**Phase to address:** **P2** (supervisor basics) for systemd unit + resource limits. **P5** (VPS) for journald retention + cert watchdog. **P11** (observation) is where slow leaks surface — plan to check at day 3 and day 7.

---

### Pitfall 7: Browser HLS codec mismatch (camera outputs H.265, viewer sees blank)

**Severity:** **HIGH** (becomes CRITICAL if it slips to post-cutover, because it presents as "origin works, nobody can watch")

**What goes wrong:**
The camera supports both H.264 and H.265. If the camera ever gets reconfigured to H.265 (maybe by someone in the router UI "to save bandwidth" or via a firmware default-reset), **MediaMTX passthrough will happily produce an HLS stream with HEVC segments**. hls.js on Chrome/Firefox/Edge will not play it. Viewers see a blank player, and the `degraded` state isn't triggered (the origin is fine — it's the browser that can't decode). **Safari users would still see the stream**, making this bug extra confusing: "Works for me on my iPhone, broken on wife's Mac/Chrome."

STACK.md §"H.264 passthrough vs H.265 transcode — VERIFIED" documents the caniuse.com 2026 state:

- Chrome: partial (HW-dependent, OS-gated)
- Firefox: partial (137+ only, HW-dependent, often disabled)
- Edge: partial (HEVC Video Extensions required on Windows)
- Safari: full

For a public angler-facing cam, assuming HEVC is a support nightmare.

**How to avoid:**

- **Camera side**: lock to H.264 at P6. Document firmware screen path in README. Put a screenshot in `packages/stream/README.md`.
- **MediaMTX side**: after boot, query `/v3/paths/get/trask` and read the track codec. If not H.264 (`codec: "H264"`), supervisor **refuses to enter `ready` state and logs `FATAL: camera codec is {actual}, expected H264`**. This fails the service fast and visibly rather than silently serving an unplayable stream. Roughly 20 LOC in `supervisor.ts` / `mediamtx-client.ts`.
- **`/health` surfaces the codec** so an ops curl can catch it: `{ codec: "H264", ... }`.
- **Optional fallback transcode path**, documented but not enabled (per STACK.md "If the camera cannot be set to H.264" section). Flipping on adds ~1 vCPU sustained.
- **P7 smoke test** includes playing the stream on Chrome Windows, Chrome macOS, Firefox, and Safari iOS. "Safari only" passing is a failure.

**Warning signs:**

- `curl stream.traskriver.com/trask/index.m3u8 | grep CODECS` returns `CODECS="hvc1.*"` or `"hev1.*"` instead of `"avc1.*"`.
- Reports from users: "It's broken on my laptop but works on my phone" (phone = Safari iOS full HEVC).
- `/health` endpoint, once wired per above, shows `codec: "H265"`.

**Phase to address:** **P3** (/health codec field). **P6** (camera H.264 config). **P7** (multi-browser smoke). **P11** (observation: if anyone firmware-updates the camera, the H.265 default can come back and the codec guard must catch it).

---

### Pitfall 8: Cutover pitfalls — web deploy precedes a stable origin, or CF Stream deleted too early

**Severity:** **HIGH**

**What goes wrong:**

1. **Web swap merged before origin has 48h of stability** → cutover happens, origin glitches in hour 3, nobody on main path has a green stream.
2. **CF Stream live input deleted within hours of cutover** → rollback needs it → 24h recovery instead of 10 min.
3. **DNS TTL too long to roll back quickly.** If `stream.traskriver.com` has TTL 3600 and CF propagation + client DNS cache compounds, a CDN-level rollback may take an hour to reach all viewers.
4. **Forgot to invalidate CF cache of old manifest / old Workers asset**. Browsers with a cached `/api/stream/demand` 200 response act on old behavior for a while.
5. **Analytics regression lands silently**. PostHog page view counting breaks during the cutover, nobody notices for 3 days.

**Why it happens:**
Cutover PRs are large. ARCHITECTURE.md §"Deletion before addition" specifically flags this as a chosen pattern — it's correct, but means the diff touches many surfaces in one commit. Missing something is easy.

**How to avoid:**

- **Cutover gate checklist** (P10 exit criteria, not rhetorical — actual blocking items):
  - [ ] `packages/stream` has been running on VPS for **≥ 48 h** without viewer traffic, `/health` all green, `restartsLast1h: 0`.
  - [ ] `curl -I https://stream.traskriver.com/trask/index.m3u8` returns the expected `Cache-Control`, `Access-Control-Allow-Origin`, and (under grey-cloud) skipped `cf-cache-status`; under orange-cloud, `cf-cache-status: DYNAMIC` or `HIT age<=2`.
  - [ ] Stream plays on Chrome/macOS, Chrome/Windows, Firefox, Safari iOS, Safari macOS.
  - [ ] `#EXT-X-DISCONTINUITY` appears after a test origin restart AND viewer recovers within buffer window.
  - [ ] Cloudflare Stream live input is **alive** (not deleted, not idle-expired — ensure a heartbeat or keep-warm is in place for the rollback period).
  - [ ] Pi relay `river-relay` service is **stopped but not disabled** and can be restarted via Tailscale SSH within 10 minutes.
  - [ ] `wrangler rollback` dry-run confirms the previous Worker version is retrievable.
- **DNS TTL pre-shortened 24h before cutover.** Set `stream.traskriver.com` TTL to 60 s the day before P10. Restore to 300 s after P11 observation.
- **Separate env flag override path.** Even though ARCHITECTURE.md argues against a runtime toggle (and that argument stands), keep `PUBLIC_STREAM_HLS_URL` as a **build-time env** that can be flipped back to a Cloudflare Stream URL for a one-commit emergency revert without restoring deleted code — by keeping the CF Stream live input alive and its URL stable, a rollback = single-line env change + `wrangler deploy`.
- **Delay CF Stream live input deletion to P12, ≥ 7 days after cutover.** Budgeted in ARCHITECTURE.md. Preserve even against pressure to "clean up."
- **Pre-cutover PostHog smoke.** Confirm the cutover branch emits `$pageview` events in a preview deploy before merging.

**Warning signs:**

- Cutover PR reviewers ask "but what if origin glitches tomorrow?" — if this doesn't have a one-sentence answer with a runbook link, don't merge.
- `wrangler deployments list` shows the previous version has been pruned (Workers keeps a limited history). Rollback surface is gone.
- DNS TTL still > 300 at cutover time.

**Phase to address:** **P8** (web swap behind flag). **P10** (cutover with gate checklist). **P11** (observation without touching rollback assets). **P12** (decommission, not one day earlier than day 7 clean).

---

### Pitfall 9: Home network fragility — ISP CGNAT, router NAT churn, mesh quirks

**Severity:** **HIGH** (CGNAT is a **CRITICAL pre-condition**; if CGNAT exists, v1.2 as designed is not possible)

**What goes wrong:**

1. **ISP is behind CGNAT**. Symptom: public IP at whatismyip.com differs from the IP on the router's WAN status page, **or** public IP is in the CGNAT range `100.64.0.0/10`. Under CGNAT, port forwarding is **impossible** because there's no 1:1 mapping between router WAN IP and real public IP. v1.2 direct-RTSP-pull architecture cannot work. No amount of router config fixes this — it's the ISP.
2. **Home upload collapses during peak residential usage.** 2 Gbps plan + 40 Mbps measured sustained (per PROJECT.md) — the measurement was at some time of day; 6 PM on a Friday may be different. Cam at 5 Mbps is well under 40, but other household upload (video calls, cloud backup, kid's Xbox) takes from the same pipe.
3. **Router NAT table entry eviction**. Cheap routers evict UDP NAT entries after 30 s, TCP after 5–15 minutes of inactivity. RTSP-over-TCP (MediaMTX default, good) means keepalives matter. If camera or router quietly drops the persistent TCP, MediaMTX reconnects — which goes through supervisor backoff (Pitfall 2) and the `EXT-X-DISCONTINUITY` story (Pitfall 3). Cascading reconnects every 5–15 min produce a stuttery stream where every gap is 2–4 s.
4. **TP-Link Deco mesh quirks with long-lived connections**. Well-known: some Deco firmware versions lose persistent TCP connections on mesh-node handoff (a wired camera shouldn't handoff, but Deco sometimes "reshuffles" device routing at its internal intervals). Symptom: regular hourly/daily reconnect at the same minute.
5. **Router reboot for updates.** Many consumer routers auto-reboot on a schedule. Stream goes dead for 30–120 s at reboot — expected, but if it happens at the wrong time (viewer spike) is user-visible.

**How to avoid:**

- **CGNAT verification is a P6 exit criterion, period.**
  - **Test 1:** Compare `curl ifconfig.me` from a device on the home LAN to the WAN IP shown in the router's admin UI. If they differ, CGNAT is in the path.
  - **Test 2:** Check if router WAN IP is in CGNAT range: `ip route get 100.64.0.0` — if router's WAN is in `100.64.0.0/10`, CGNAT is definite.
  - **Test 3:** After configuring port 554 forward, run `nmap -p 554 <your-ddns-hostname>` from outside (VPS is a great vantage point). If it returns `filtered` despite LAN-side camera listening on 554, **CGNAT is blocking**. (Could also be ISP port-block — some ISPs block incoming TCP on residential service; check ToS.)
  - **Mitigation if CGNAT exists:** (a) Call ISP and ask for a static public IPv4 (may cost $5–15/month). (b) Use IPv6 end-to-end — feasible only if VPS and camera both speak IPv6 publicly and the camera supports outbound IPv6 for RTSP; verify before relying on it. (c) **Reverse-tunnel mode**: run a tiny Tailscale node (or Cloudflare Tunnel/`cloudflared` on a Pi) on the LAN, and have MediaMTX's RTSP source be `rtsp://100.x.x.x:554/...` over Tailscale rather than over the public internet. This is the cleanest CGNAT workaround; it costs the "Pi is fully retired" decision (we'd keep a minimal Pi role as the Tailscale relay). **Trade worth evaluating at P0 alongside the CF ToS decision.**
- **Bandwidth budget with headroom.** Camera bitrate ≤ **6 Mbps CBR** (well under 40 Mbps home upload ceiling, well under any reasonable peak-residential-usage floor). Do not exceed. Document in camera-config README.
- **Router quirks documented, not assumed.** In `packages/stream/README.md` §"Known home-network quirks": note TP-Link Deco firmware version in use, any observed periodic-reconnect pattern, the home router's NAT entry TTL if accessible. Empirically update.
- **Router auto-update scheduled for low-traffic hours** (e.g. 03:00 local), and documented.
- **Supervisor treats hourly-periodic reconnects as normal** (logged at INFO, not WARN) as long as backoff is < 5s and DISCONTINUITY is emitted. WARN only if reconnect rate exceeds 1/hour or if recovery time exceeds 8s.

**Warning signs:**

- During smoke test, `nmap -p 554 cam.ddns.example` from the VPS returns `filtered` even with camera on and router-forward configured → CGNAT almost certainly.
- `/health` `restartsLast1h` shows a periodic cadence (every 58–62 minutes) → router NAT eviction.
- `/health` `restartsLast24h > 20` over many days → home network is not steady enough for this design.

**Phase to address:** **P6** (verification). CGNAT discovery **blocks** P7+ until resolved or design pivoted. Pitfall 1 (CF ToS) and CGNAT (this pitfall) are the two P0/P6 gates that can force a redesign.

---

### Pitfall 10: Monorepo / TypeScript — Workers types leak into Node, Turbo caches stale builds

**Severity:** **MEDIUM**

**What goes wrong:**

1. **`packages/shared` imports Cloudflare Workers types** (e.g. `KVNamespace`, `WorkerEntrypoint`, Web Crypto variants) into a Node runtime. Compile passes, runtime fails with `ReferenceError: KVNamespace is not defined` or (worse) silent behavior mismatches.
2. **Turbo caches a build from one package target and serves it to another.** `packages/web` builds for Workers, `packages/stream` builds for Node 22, and if Turbo's cache key doesn't distinguish target, stream gets Workers-compiled code.
3. **Bun tool-time vs Node runtime drift.** `bun install` resolves dependencies using Bun's resolver and writes `bun.lockb`; Node 22 runtime loads those same `node_modules` at runtime. Most of the time this is fine; corner cases — native-addon packages (`fsevents`, `esbuild`, `lightningcss`) — can end up with the wrong binary if the install and the runtime machine architectures differ (e.g. Bun install on ARM macOS dev, Node runtime on x86_64 Linux VPS).
4. **ESM/CJS interop on edge packages.** `execa@9` is ESM-only; if `packages/stream` tsconfig compiles to CJS, the import line silently gets replaced with a `require()` that throws `ERR_REQUIRE_ESM` on Node 22.
5. **`return-type` rule friction.** User rule: no explicit return types unless strongly justified. Inference across package boundaries can silently produce `unknown` or `any` for re-exported symbols when the consumer's tsconfig differs — e.g. consumer is `strict: true` but re-exports `any` without complaint.

**Why it happens:**
Monorepo targeting two runtimes (Workers and Node) is a well-known foot-gun. The existing repo has `packages/web` (Workers) and `packages/relay` (Bun/Node) but they don't share much surface because relay is simple. `packages/stream` is the first Node package that imports from `@traskriver/shared` after shared types have been shaped with the Workers consumer in mind.

**How to avoid:**

- **Explicit `engines` field** in `packages/stream/package.json`: `"engines": { "node": ">=22.0.0" }`.
- **Deploy-time build is CI-independent.** xCloud (per PROJECT.md, user-owned) runs the build; the build command must work from a clean clone. Verify by `rm -rf node_modules dist && bun install && bun run build && node dist/index.js --version` in a CI step or local smoke.
- **tsconfig target discipline.**
  ```jsonc
  // packages/stream/tsconfig.json
  {
  	"compilerOptions": {
  		"target": "es2023",
  		"module": "nodenext",
  		"moduleResolution": "nodenext",
  		"lib": ["es2023"], // no DOM, no WebWorker
  		"types": ["node"], // NOT ["node", "@cloudflare/workers-types"]
  		"strict": true,
  		"noEmitOnError": true
  	}
  }
  ```
  Crucially: `lib` and `types` exclude Workers/DOM. Any accidental import of a Workers-only type throws at compile time, not at runtime.
- **Shared package subpath split per ARCHITECTURE.md**. Relay types under `@traskriver/shared/relay`; Workers-flavored types (if any emerge) under `@traskriver/shared/workers`; Node-flavored under `@traskriver/shared/node`. `packages/stream` imports only from `@traskriver/shared` or `@traskriver/shared/node`. If there's nothing Node-specific in shared, `packages/stream` imports nothing — which is the current reality per ARCHITECTURE.md.
- **Turbo task graph** with proper input/output.
  ```jsonc
  {
  	"pipeline": {
  		"build": {
  			"dependsOn": ["^build"],
  			"inputs": ["src/**", "tsconfig.json", "package.json"],
  			"outputs": ["dist/**"],
  			"env": ["NODE_ENV"]
  		}
  	}
  }
  ```
  Add `env: ["NODE_ENV"]` only if it matters; for stream package, build output is runtime-agnostic so it should not. **Run `turbo run build --filter=stream` in CI to verify the package builds standalone**, catching accidental cross-package pollution.
- **ESM-only discipline in stream.** package.json `"type": "module"`, all relative imports include `.js` extension in source (per `nodenext`). Follow `execa@9` examples verbatim.
- **CI smoke: compile + `node --check dist/index.js`** as a non-negotiable gate.

**Warning signs:**

- `node dist/index.js` on VPS throws `ReferenceError` for a Web API or Workers binding.
- `bun run build` succeeds but `node` refuses to load the output — classic ESM/CJS.
- `ts-expect-error` creeping into `packages/shared` to silence Workers-vs-Node type conflicts.

**Phase to address:** **P1** (stream skeleton: tsconfig, package.json, first build). **P4** (shared types move). CI smoke as a P1 exit criterion.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut                                               | Immediate Benefit                                           | Long-term Cost                                                                                                               | When Acceptable                                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Serve HLS under orange-cloud CF without addressing ToS | Free global edge cache, DDoS shield, existing DNS untouched | Viewer outage when CF enforces; reactive redesign under pressure                                                             | **Never** — Pitfall 1 chosen path resolves at P0.                                     |
| Single-rendition only, no ABR                          | Half the CPU cost of multi-rendition, simpler origin        | Mobile-on-3G viewers buffer and leave. At v1.2 scale (local anglers on WiFi/LTE) this is fine; changes when audience widens. | MVP and foreseeable v1.2 life.                                                        |
| Tmpfs-only segments, no persistence                    | No disk IO, auto-cleanup, small VPS                         | Lose ability to add DVR later without re-plumbing                                                                            | Always for MVP. Revisit at v1.3 if DVR ever in scope.                                 |
| `RIVER_KV` binding kept in wrangler.jsonc but unused   | Zero-effort cold-fallback reactivation                      | Cognitive debt: "why is this binding here?" future-dev confusion                                                             | Acceptable with one-line comment in `wrangler.jsonc`.                                 |
| No explicit return types (per user rule)               | Faster reading, less ceremony                               | Cross-package type drift hides until runtime                                                                                 | Always, per user rule. Mitigate with strict tsconfig at package boundaries.           |
| `EXT-X-DISCONTINUITY` emitted but not verified in CI   | Faster P7                                                   | Silent regression on a future MediaMTX upgrade                                                                               | Acceptable for MVP; add a P11/P12 action item to script a monthly restart-and-verify. |
| Manifest-freshness as sole viewer-side liveness signal | No extra endpoint; viewer sees truth                        | Confusing to debug: "origin healthy but user says 'degraded'"                                                                | Always; pair with `/health` on ops surface to close the diagnostic loop.              |
| No uptime monitor in MVP                               | One less moving part                                        | First 404-flood cascades without alerting                                                                                    | Acceptable for 2-week window post-cutover; add free UptimeRobot by P12.               |
| ffmpeg / MediaMTX `systemctl restart` weekly           | Papers over slow memory leaks for free                      | Masks the underlying leak if it exists                                                                                       | Acceptable; log a weekly-restart observation metric and investigate any uptrend.      |
| DDNS hostname trusted without fingerprint pin          | Simple config                                               | DDNS hijack = supervisor connects to hostile source                                                                          | Acceptable at v1.2 scale; document as a known residual risk.                          |
| Pi retained as cold-fallback but unmaintained          | Instant rollback available for 6 months                     | Eventually: Pi OS CVEs, deprecated secrets, forgotten Tailscale auth                                                         | Acceptable for 6 months post-cutover; schedule decommission review at v1.3 kickoff.   |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration                              | Common Mistake                                                                       | Correct Approach                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare CDN + video                   | Orange-cloud a video subdomain and hope                                              | **Grey-cloud** or use R2-backed origin or pay for Stream (Pitfall 1).                                                                                    |
| Cloudflare Workers + Node shared package | One `shared` package imports both `@cloudflare/workers-types` and uses `node:crypto` | Split by subpath (ARCHITECTURE.md §"subpath export"); tsconfig `types` excludes the other runtime.                                                       |
| DDNS + RTSP                              | Forward multiple camera ports "for admin access"                                     | Forward **only** 554/tcp; route admin via Tailscale/VPN (Pitfall 5).                                                                                     |
| MediaMTX spawned by Node                 | Rely on SIGTERM = graceful forever                                                   | Fastify `/health` must drain first; SIGTERM→10s→SIGKILL fallback like existing `FfmpegManager`.                                                          |
| systemd + long-running ffmpeg            | `Restart=always` with no `StartLimitBurst`                                           | Tune `StartLimitBurst=10` + `StartLimitIntervalSec=300` to alert, not silently burn CPU.                                                                 |
| Let's Encrypt + MediaMTX                 | Manual renewal, forgot the deploy-hook                                               | certbot systemd timer with `deploy-hook` that reloads MediaMTX; watchdog alert on < 14 days to expiry.                                                   |
| hls.js + MediaMTX HLS                    | `hlsVariant: lowLatency` enabled on origin without testing player                    | Start with `hlsVariant: lowLatency` (STACK.md already specifies) but test explicitly — some older hls.js behaves oddly with `EXT-X-PART`. Confirm in P7. |
| PostHog + cutover                        | Forget that deleting pages changes referrer tracking                                 | Preview the cutover build against PostHog before merging (Pitfall 8).                                                                                    |
| Turbo cache + multi-target packages      | Stale cache from `packages/web` served to `packages/stream`                          | Explicit `inputs`/`outputs`/`env` per package; smoke-run from clean clone.                                                                               |
| Cloudflare Stream live input deletion    | "Cleaning up" immediately post-cutover                                               | Keep alive ≥ 7 days for rollback (Pitfall 8).                                                                                                            |
| xCloud-managed VPS                       | Assume snapshots happen automatically                                                | Verify with provider; if not, scheduled `pg_basebackup`-style snapshot of `/opt/stream` config (not segments) before any config change.                  |

---

## Performance Traps

Patterns that work at 1 viewer but fail under real load.

| Trap                                                          | Symptoms                                                 | Prevention                                                                              | Scale threshold (for this project)                         |
| ------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| m3u8 cached > 2s at any layer                                 | All viewers stuck on stale manifest after origin restart | `Cache-Control: max-age=1` + CDN rule enforcing                                         | Fires at the first origin restart with > 1 viewer.         |
| Segment TTL < 10 min                                          | Origin egress spikes every few seconds as CDN refetches  | `max-age=86400, immutable` + unique filenames                                           | Fires at > 5 concurrent viewers without CDN.               |
| RTSP over UDP instead of TCP                                  | Packet loss → visible glitches; reconnect cost           | `sourceProtocol: tcp` in MediaMTX                                                       | Fires on first non-LAN congestion.                         |
| hls.js `liveSyncDurationCount` mismatched to segment duration | Buffer starved → rebuffer every 10–30 s                  | Keep current config (`liveSyncDurationCount: 3` ≈ 6 s with 2 s segments; already tuned) | Fires with > 1 s segments or < 3 back-buffered.            |
| Grey-cloud with > 100 concurrent viewers                      | VPS NIC saturates → everyone drops                       | Architect Bunny.net or R2 fallback, pre-wired                                           | Fires at ~100 × 5 Mbps = 500 Mbps if VPS has a 1 Gbps NIC. |
| Fastify logging full request bodies in prod                   | Disk fill, log pressure                                  | `logger: { level: 'info' }` + no req-body logging                                       | Fires slowly (days).                                       |
| Journal without retention                                     | Disk fill over weeks                                     | `SystemMaxUse=500M`                                                                     | Fires at ~2 GB of logs (≈ 30 days at typical verbosity).   |

**First bottleneck that bites at v1.2 scale:** Cloudflare ToS (Pitfall 1), not technical capacity. Second: home upload under peak residential contention (Pitfall 9, unlikely at 5 Mbps).

---

## Security Mistakes

Domain-specific beyond general web security.

| Mistake                                         | Risk                                                                           | Prevention                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Forward camera admin port 80/443                | Trivial credential-spray / CVE compromise (CVE-2021-33044 CISA KEV)            | Only 554/tcp forwarded (Pitfall 5).                                                                                                  |
| Default / weak RTSP credentials                 | `dahua_exploit.py` auto-cycles defaults; unpatched firmware = game over        | 20+ char unique RTSP password; distinct RTSP user with minimum privileges.                                                           |
| Unpatched camera firmware                       | Known RCE/DoS CVEs including CISA KEV actively exploited                       | Firmware version pinned in README; 90-day recheck; CVE pre-flight in P6.                                                             |
| Orange-cloud with origin IP leak                | Direct attacks bypass CF WAF                                                   | Grey-cloud (ToS pitfall fixes this anyway); or CF Origin Cert + restrict VPS firewall to CF IPs.                                     |
| `/health` exposed on public subdomain           | Internal state leaked (restart counts, last error strings, host uptime)        | Tailscale-only binding or CF Access (ARCHITECTURE.md already specifies).                                                             |
| No rate limit at origin                         | RTSP port becomes a DoS target if probed                                       | MediaMTX `readTimeout` + `hlsMaxReaders: 200` + iptables `-m limit` on 554/tcp from non-VPS IPs.                                     |
| Supervisor trusts DDNS without verification     | DDNS takeover → supervisor pulls hostile RTSP                                  | Document as residual risk; alert on unexpected codec switch or resolution change in supervisor logs.                                 |
| `CAM_PASS` in plaintext in systemd unit         | `cat /etc/systemd/system/stream.service` reveals credentials to any LOCAL user | Use `EnvironmentFile=-/etc/stream/stream.env` with `chmod 600` + `chown stream:stream`.                                              |
| Logs contain RTSP URL with password             | `journalctl` output shared for debugging leaks credential                      | MediaMTX supports credentials separate from URL; Node supervisor redacts any `rtsp://user:pass@...` patterns in pino before logging. |
| Unauthenticated `/health` POST / control routes | Nothing exists, but a "nice to have" restart endpoint could creep in           | `/health` is GET-only; any control routes require Tailscale binding + a bearer token, and are deferred to v1.3+.                     |

---

## UX Pitfalls

Common viewer-experience mistakes in this domain.

| Pitfall                                                     | User impact                                        | Better approach                                                                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Frozen frame on camera drop with no indicator               | User thinks the site is broken                     | `degraded` state with overlay "Camera offline — retrying" (FEATURES.md, ARCHITECTURE.md Pattern 2).                             |
| Blank player on HEVC stream in Chrome                       | User thinks the site is broken (Pitfall 7)         | Supervisor refuses to start unless codec is H.264.                                                                              |
| Long cold-start (existing v1.1 pain point)                  | User bounces                                       | v1.2 by design removes this; verify by hitting the URL cold from an incognito window and measuring first-frame. Target: ≤ 3 s.  |
| Viewer count shown but inaccurate                           | Trust erosion                                      | Retire on-page viewer count (FEATURES.md decision already).                                                                     |
| Browser caching old `+page.svelte` with demand-start button | Clicking a ghost button does nothing               | Hashed asset filenames (SvelteKit default); SWR / service-worker caches: none currently; no action needed but don't introduce.  |
| Player locked to Safari's HLS path, hls.js never tested     | iOS works, desktop doesn't                         | Test on all 4 browsers in P7 (Pitfall 7 preventive).                                                                            |
| "Watching live" shown while `degraded`                      | Dishonest; user sees frozen frame but UI says live | `degraded` overrides the "live" pill; overlay + dim frame.                                                                      |
| `/preview.jpg` stale for hours during camera outage         | Snapshot claims fresh but isn't                    | Snapshot freshness is conveyed via a response header `X-Snapshot-Age` and the UI hides the snapshot-as-poster when `age > 60s`. |
| Cutover day page loads but `liveSrc` is blank env var       | Player errors in production                        | Build-time env validation via zod on `PUBLIC_STREAM_HLS_URL` in `+page.server.ts` or `+layout.svelte`.                          |

---

## "Looks Done But Isn't" Checklist

Things that appear complete in dev but miss a prod-critical piece. Useful as a P7/P10 gate.

- [ ] **Supervisor restarts on MediaMTX crash** — verify by `kill -9 $(pgrep mediamtx)`; must restart within 6 s, log backoff step, not saturate CPU on repeated kills.
- [ ] **Backoff cap** — force a sticky failure (e.g. wrong RTSP URL) and verify backoff reaches 30 s cap and stays there, not growing unbounded.
- [ ] **Stall watchdog** — unplug camera PoE; verify `/health` flips `rtspConnected: false` within 90 s and supervisor restarts MediaMTX.
- [ ] **`EXT-X-DISCONTINUITY` on origin restart** — `systemctl restart stream`; grep manifest for `DISCONTINUITY` tag; verify hls.js resumes without page refresh.
- [ ] **Multi-browser playback** — Chrome/macOS, Chrome/Windows, Firefox (latest + ESR), Safari iOS, Safari macOS. **Safari-only passing is a failure.**
- [ ] **Cache headers at the edge** — `curl -I` manifest + segment under the chosen path (grey-cloud: direct; orange-cloud or Bunny: through CDN) returns expected `Cache-Control` and `Access-Control-Allow-Origin: *`.
- [ ] **Codec guard** — temporarily reconfigure camera to H.265; supervisor must refuse to enter `ready` and must log the exact codec observed. Revert camera to H.264 after test.
- [ ] **CVE pre-flight** — current camera firmware is not on CVE-2021-33044/45, CVE-2025-31700/31701, CVE-2025-65857, CVE-2025-66176/66177 lists; recorded in `FIRMWARE.md`.
- [ ] **CGNAT verification** — `nmap -p 554 cam.ddns.example` from VPS returns `open` with camera running; `filtered` or `closed` means CGNAT or ISP block (Pitfall 9).
- [ ] **Rollback path** — Cloudflare Stream live input still exists + a previous Workers deployment is visible in `wrangler deployments list`.
- [ ] **DNS TTL pre-shortened** to 60 s the day before P10.
- [ ] **Journald retention** — `/etc/systemd/journald.conf.d/stream.conf` active; `systemctl restart systemd-journald` applied.
- [ ] **tmpfs for segments** — `mount | grep '/var/lib/stream/hls'` shows `tmpfs`, size 256 M.
- [ ] **Cert auto-renewal** — only if orange-cloud. `certbot renew --dry-run` succeeds + deploy-hook reloads MediaMTX.
- [ ] **PostHog events emit in production build** — preview deploy shows `$pageview` in PostHog Live Events.
- [ ] **`/health` on ops-only hostname** — `curl https://stream.traskriver.com/health` does NOT return supervisor internals; `curl --tailscale ops.stream.traskriver.com/health` does.
- [ ] **Pi relay stopped but reactivatable** — `systemctl is-active river-relay` returns `inactive`; `systemctl is-enabled river-relay` returns `disabled` or `masked`; reactivation documented in `packages/relay/README.md`.
- [ ] **Browser console clean on page load** — no 4xx requests to deleted routes (`/api/stream/demand`, `/api/relay/status`).

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall                                                     | Recovery cost                                                        | Recovery steps                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. CF ToS enforcement mid-operation**                     | MEDIUM (1–4 h)                                                       | Flip `stream.traskriver.com` DNS to grey-cloud in CF dashboard (propagates at pre-shortened TTL within minutes). Investigate the CF notification email. If persistent, migrate to Bunny.net pull-zone (pre-documented runbook; DNS change only).                                                                                                               |
| **2. RTSP reconnect storm**                                 | LOW (5–15 min)                                                       | SSH to VPS, `systemctl stop stream`, wait 60 s, check camera reachability from VPS (`ffprobe rtsp://...`), restart. If camera itself is wedged, power-cycle via smart plug or documented LAN reboot.                                                                                                                                                           |
| **3. Cache-poisoned segment numbering**                     | MEDIUM (30 min)                                                      | `systemctl stop stream`; CF/Bunny cache purge via API or dashboard (script pre-documented); `systemctl start stream`; verify manifest sequence starts fresh; viewers reload.                                                                                                                                                                                   |
| **4. Stale manifest cascade**                               | LOW (10 min)                                                         | Purge `*.m3u8` pattern at CDN; recheck `Cache-Control` headers; if repeat, reduce m3u8 TTL to 1 s explicitly and re-verify.                                                                                                                                                                                                                                    |
| **5a. Camera compromised**                                  | HIGH (hours to day)                                                  | Immediately disconnect camera from LAN; rotate ALL credentials (RTSP user, admin user, router admin, DDNS account, Cloudflare account if shared email); audit VPS for lateral movement (`lastb`, `journalctl --priority=err`, outbound connections `ss -tnp`); firmware-update camera offline; reintroduce only with fresh credentials + CVE-cleared firmware. |
| **5b. DDNS hijack**                                         | MEDIUM (1–3 h)                                                       | Point `CAM_HOSTNAME` at IP directly in `/etc/hosts` on VPS (or use MediaMTX `source` override with literal IP) for immediate recovery; migrate to a different DDNS provider with MFA; update README.                                                                                                                                                           |
| **6. Runaway restart loop / systemd StartLimitBurst fired** | LOW (15 min)                                                         | SSH: `journalctl -u stream -n 200` to find root cause; `systemctl reset-failed stream`; fix config; `systemctl start stream`.                                                                                                                                                                                                                                  |
| **7. HEVC from camera in prod**                             | LOW (5 min to trigger; hours if camera UI can't be reached remotely) | Log shows codec guard fired; SSH to LAN via Tailscale; camera UI → H.264; `systemctl restart stream`; supervisor becomes `ready`; viewers reconnect automatically.                                                                                                                                                                                             |
| **8. Cutover regression**                                   | LOW–MEDIUM                                                           | `wrangler rollback` to previous Workers version; if origin is the problem, boot Pi via Tailscale SSH + `systemctl start river-relay`; CF Stream live input serves immediately. Timer: < 10 min if Pi is on, < 30 min if Pi is cold.                                                                                                                            |
| **9a. CGNAT discovered post-P6**                            | HIGH (redesign)                                                      | Decide at P0-equivalent point: (a) request static IP from ISP (days), (b) IPv6-only path (verify compat), (c) reverse-tunnel via Tailscale keeping Pi in LAN as a bridge (Pi now has a minimal role, not fully retired).                                                                                                                                       |
| **9b. Home network periodic reconnects**                    | LOW (doc + accept)                                                   | If reconnects < 1/hour AND recovery < 8 s AND `DISCONTINUITY` emits: accept, document cadence, no action. If worse: investigate router NAT TTL settings.                                                                                                                                                                                                       |
| **10. Monorepo type drift blowing up at prod boot**         | LOW–MEDIUM                                                           | Add explicit tsconfig `types`/`lib` narrowing; force `turbo run build --filter=stream --force` from clean clone; smoke on an x86_64 Linux container matching the VPS before deploying.                                                                                                                                                                         |

---

## Pitfall-to-Phase Mapping

For the ROADMAP author: which pitfall must be addressed by which phase, and what success evidence looks like.

| Pitfall                                  | Severity                       | Prevention phase                                                   | Verification at phase exit                                                                                                                                        |
| ---------------------------------------- | ------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Cloudflare ToS                        | CRITICAL                       | **P0** (milestone decision)                                        | Written decision recorded in PROJECT.md Key Decisions table; if grey-cloud chosen, ARCHITECTURE.md §"Cloudflare CDN Configuration" marked ambient-reference-only. |
| 2. RTSP reconnect + stall                | HIGH                           | P2 (supervisor) + P6 (GOP) + P7 (tested)                           | Supervisor passes `kill -9 mediamtx` and unplug-camera tests; `/health` reports restart events; DISCONTINUITY present in manifest.                                |
| 3. HLS discontinuity / segment numbering | HIGH                           | P2 (supervisor filename uniqueness) + P7 (tested)                  | Restart-during-playback smoke passes with no viewer error.                                                                                                        |
| 4. CDN cache stampede                    | HIGH (MEDIUM under grey-cloud) | P5 (CDN/VPS config) + P7 (`curl -I` verification)                  | Cache headers observed correct; no m3u8 cache-status: HIT with age>2.                                                                                             |
| 5. Camera exposure security              | CRITICAL                       | P6 (port + creds + CVE pre-flight)                                 | `nmap` from external shows only 554/tcp; firmware in FIRMWARE.md; CVE list cleared.                                                                               |
| 6. ffmpeg/MediaMTX long-run leaks        | HIGH                           | P2 (systemd limits) + P5 (journald retention) + P11 (observation)  | 7-day observation: restart count, memory, FD count within thresholds.                                                                                             |
| 7. Browser codec mismatch                | HIGH                           | P3 (/health codec) + P6 (camera config) + P7 (multi-browser smoke) | `/health.codec == "H264"`; all 4 browsers play.                                                                                                                   |
| 8. Cutover mistakes                      | HIGH                           | P8 (flag) + P10 (gate) + P11 (observation) + P12 (decomm)          | Gate checklist all green pre-P10 merge; CF Stream kept ≥ 7 days.                                                                                                  |
| 9. Home network / CGNAT                  | CRITICAL (CGNAT) / HIGH (rest) | **P6** (CGNAT verification)                                        | `nmap -p 554 cam.ddns.example` from VPS returns `open`; home upload ≥ 20 Mbps headroom verified at a peak-usage time.                                             |
| 10. Monorepo / TS                        | MEDIUM                         | P1 (tsconfig + build CI) + P4 (shared types split)                 | `turbo run build --filter=stream` succeeds from clean clone; `node dist/index.js --version` succeeds on x86_64 Linux.                                             |

---

## Sources

**Cloudflare ToS (Pitfall 1) — all verified 2026-04-20:**

- Cloudflare Self-Serve Subscription Agreement, last updated **2025-09-12** — https://www.cloudflare.com/subscriptionagreement/ — HIGH.
- Cloudflare Service-Specific Terms, last updated **2026-03-24**, §"Content Delivery Network (Free, Pro, or Business)" — https://www.cloudflare.com/service-specific-terms-application-services/ — HIGH.
- Cloudflare Fundamentals: "Delivering Videos with Cloudflare" — https://developers.cloudflare.com/fundamentals/reference/policies-compliances/delivering-videos-with-cloudflare — HIGH.
- Cloudflare blog: "Goodbye, section 2.8 and hello to Cloudflare's new terms of service", 2023-05-16 — https://blog.cloudflare.com/updated-tos — HIGH (historical context).
- Community thread: "This Video has been restricted. Streaming video from Cloudflare basic service is a violation" — https://community.cloudflare.com/t/this-video-has-been-restricted-streaming-video-from-cloudflare-basic-service-is-a-violation/412283 — MEDIUM (enforcement pattern evidence).
- Bunny Stream pricing — https://docs.bunny.net/stream/pricing — HIGH (alternative path b).

**Camera security (Pitfall 5) — CVE data:**

- CVE-2021-33044, CVE-2021-33045 (Dahua, CVSS 9.8, CISA KEV) — Dahua DSA-2021-001. HIGH.
- CVE-2025-31700, CVE-2025-31701 (Dahua, CVSS 8.1, 2025) — Dahua Security Advisory, sploitus exploit 2026-03-03. HIGH.
- CVE-2025-65857 (Xiongmai XM530 + ANBIUX rebrands, CVSS 9.1, hardcoded RTSP creds) — https://luismirandaacebedo.github.io/CVE-2025-65857/ — HIGH.
- CVE-2025-66176, CVE-2025-66177 (Hikvision, CVSS 8.8, LAN-adjacent, 2026-01-12) — https://www.hikvision.com/en/support/cybersecurity/security-advisory/buffer-overflow-vulnerabilities-in-some-hikvision-products/ — HIGH.

**Internal:**

- `.planning/PROJECT.md` — milestone scope, camera details, network constraints.
- `.planning/research/STACK.md` — MediaMTX config, HEVC browser support matrix (caniuse.com/hevc 2026), cache-header specification.
- `.planning/research/ARCHITECTURE.md` — phase build order, cutover strategy, `/health` surfacing anti-pattern, subpath export for shared types.
- `.planning/research/FEATURES.md` — state-machine simplification, manifest-freshness pattern for `degraded`, viewer-count retirement.
- `packages/relay/src/ffmpeg.ts` — existing `FfmpegManager` supervision pattern: stderr-activity watchdog (`HEALTH_STALL_TIMEOUT_MS = 320_000` — note: too long for always-on context, tune down to 60–90 s in `packages/stream`), SIGTERM→10s→SIGKILL escalation, exit-callback plumbing. Port with adjustments.

**Standards:**

- RFC 8216 (HLS) §4.3.3.2 `EXT-X-MEDIA-SEQUENCE`, §4.3.2.3 `EXT-X-DISCONTINUITY`.

---

_Pitfalls research for: v1.2 Self-Hosted HLS Origin (`packages/stream`, traskriver.com)._
_Researched: 2026-04-20._
