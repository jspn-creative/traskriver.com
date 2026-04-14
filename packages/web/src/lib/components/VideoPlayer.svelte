<script lang="ts">
	import { defineCustomElements } from 'vidstack/elements';
	import defaultPoster from '$lib/assets/default.jpg';
	import posthog from 'posthog-js';

	const __DEV__ = import.meta.env.DEV;
	const MANIFEST_PROBE_INTERVAL_MS = 3_000;

	// Production-safe log: key lifecycle events only (not noisy probes/retries)
	const log = (msg: string, data?: Record<string, unknown>) =>
		console.log(`[VideoPlayer] ${msg}`, data ?? '');

	let {
		liveSrc,
		poster = defaultPoster,
		class: className,
		sessionActive = false,
		onPlaying,
		onError,
		onBuffering
	} = $props<{
		liveSrc: string;
		poster?: string;
		class?: string;
		sessionActive?: boolean;
		onPlaying?: () => void;
		onError?: () => void;
		onBuffering?: (buffering: boolean) => void;
	}>();

	let container: HTMLDivElement | undefined = $state();
	let player: any = $state();
	let isFullscreen = $state(false);
	let isPlaying = $state(false);
	let hasError = $state(false);
	let manifestReady = $state(false);
	/** Only for last-resort remount after fatal HLS error */
	let playerKey = $state(0);

	let remountTimeout: ReturnType<typeof setTimeout> | undefined;
	let emptyManifestCount = 0;

	// Stall tracking (for logging only — HLS.js handles recovery via config)
	let stallCount = 0;

	$effect(() => {
		void defineCustomElements();
	});

	// Probe the HLS manifest before initialising the player.
	// CF Stream needs 10-30s after the relay reports "live" to produce HLS
	// segments.  Polling here avoids mounting HLS.js against an empty manifest
	// (which caused hundreds of noisy levelEmptyError retries).
	//
	// CF Stream serves a two-level manifest: a master playlist with
	// #EXT-X-STREAM-INF entries pointing to per-rendition playlists.  The master
	// appears almost immediately, but the rendition playlists stay empty until
	// segments have actually been encoded.  We therefore follow through to the
	// first rendition and check *that* for #EXTINF before declaring ready.
	$effect(() => {
		if (manifestReady) return;

		let cancelled = false;
		let probeCount = 0;

		/** Fetch a URL with cache-busting. */
		const fetchCacheBusted = (url: string) => {
			const sep = url.includes('?') ? '&' : '?';
			return fetch(`${url}${sep}_cb=${Date.now()}`, {
				signal: AbortSignal.timeout(5_000),
				cache: 'no-store'
			});
		};

		/** Extract the first rendition playlist URI from a master manifest. */
		const extractRenditionUrl = (masterText: string, masterUrl: string): string | null => {
			// Lines after #EXT-X-STREAM-INF are relative or absolute URIs.
			const lines = masterText.split('\n');
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].startsWith('#EXT-X-STREAM-INF') && i + 1 < lines.length) {
					const uri = lines[i + 1].trim();
					if (!uri || uri.startsWith('#')) continue;
					// Resolve relative URIs against the master URL
					try {
						return new URL(uri, masterUrl).href;
					} catch {
						return null;
					}
				}
			}
			return null;
		};

		log('manifest probe started');

		const probe = async () => {
			probeCount += 1;
			try {
				const masterUrl = liveSrc;
				const res = await fetchCacheBusted(masterUrl);
				if (cancelled) return;

				if (res.status === 204) {
					// 204 = CF Stream has no active live input. Stream isn't pushing RTMP yet.
					if (probeCount <= 3 || probeCount % 10 === 0)
						log('waiting for stream (CF returned 204)', { probe: probeCount });
					if (!cancelled) setTimeout(probe, MANIFEST_PROBE_INTERVAL_MS);
					return;
				}

				if (!res.ok) {
					if (probeCount <= 3 || probeCount % 10 === 0)
						log('manifest probe HTTP error', { probe: probeCount, status: res.status });
					if (!cancelled) setTimeout(probe, MANIFEST_PROBE_INTERVAL_MS);
					return;
				}

				const text = await res.text();
				if (cancelled) return;

				if (!text.includes('#EXTM3U')) {
					if (probeCount <= 3 || probeCount % 10 === 0)
						log('manifest not valid M3U yet', {
							probe: probeCount,
							status: res.status,
							bodyPreview: text.slice(0, 120)
						});
					if (!cancelled) setTimeout(probe, MANIFEST_PROBE_INTERVAL_MS);
					return;
				}

				// Single-level manifest (has segments directly) — ready.
				if (text.includes('#EXTINF')) {
					log('manifest ready (single-level)', { probes: probeCount });
					manifestReady = true;
					return;
				}

				// Multi-level (master) manifest — follow through to a rendition.
				if (text.includes('#EXT-X-STREAM-INF')) {
					const renditionUrl = extractRenditionUrl(text, masterUrl);
					if (!renditionUrl) {
						if (probeCount <= 3 || probeCount % 10 === 0)
							log('master manifest has no parseable rendition URI', { probe: probeCount });
						if (!cancelled) setTimeout(probe, MANIFEST_PROBE_INTERVAL_MS);
						return;
					}

					const rendRes = await fetchCacheBusted(renditionUrl);
					if (cancelled) return;
					if (rendRes.ok) {
						const rendText = await rendRes.text();
						if (rendText.includes('#EXTINF')) {
							log('manifest ready (multi-level)', { probes: probeCount });
							manifestReady = true;
							return;
						}
						if (probeCount <= 3 || probeCount % 10 === 0)
							log('rendition exists but no segments yet', { probe: probeCount });
					} else {
						if (probeCount <= 3 || probeCount % 10 === 0)
							log('rendition probe failed', { probe: probeCount, status: rendRes.status });
					}
				} else {
					if (probeCount <= 3 || probeCount % 10 === 0)
						log('manifest exists but unrecognized format', {
							probe: probeCount,
							bodyPreview: text.slice(0, 120)
						});
				}
			} catch (err) {
				// Log the actual error to help diagnose silent probe failures
				if (probeCount <= 3 || probeCount % 10 === 0)
					log('manifest probe failed', { probe: probeCount, error: String(err) });
			}
			if (!cancelled) {
				setTimeout(probe, MANIFEST_PROBE_INTERVAL_MS);
			}
		};

		void probe();
		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		if (!player) return;
		const el = player;

		const onProviderChange = (e: any) => {
			const provider = e.detail;
			if (provider?.type === 'hls') {
				log('HLS provider attached (hls.js)');
				provider.config = {
					...provider.config,
					fragLoadingTimeOut: 20000,
					manifestLoadingTimeOut: 20000,
					levelLoadingTimeOut: 20000,
					// Live edge targeting: stay 3 segments behind live edge.
					liveSyncDurationCount: 3,
					// Auto-jump to live edge if >5 segments behind.
					liveMaxLatencyDurationCount: 5,
					// Speed up playback to 1.5x to catch up to live edge
					// instead of stalling. HLS.js handles this natively.
					maxLiveSyncPlaybackRate: 1.5,
					// Don't keep played data — frees memory on constrained
					// streams and avoids stale buffer issues.
					backBufferLength: 10,
					// Cache-bust m3u8 requests via URL query param (not a request header)
					// to avoid stale empty-manifest responses without triggering CORS preflight.
					xhrSetup(xhr: XMLHttpRequest, url: string) {
						if (url.endsWith('.m3u8') || url.includes('.m3u8?')) {
							const bust = `_cb=${Date.now()}`;
							const sep = url.includes('?') ? '&' : '?';
							xhr.open('GET', `${url}${sep}${bust}`, true);
						}
					}
				};
			} else {
				log('provider attached', { type: provider?.type ?? 'unknown' });
			}
		};

		// Track media element lifecycle events for visibility into the
		// gap between provider attach and playback start.
		const onCanPlay = () => {
			log('canplay fired');
			onBuffering?.(false);
		};
		const onWaiting = () => {
			log('waiting (buffering)');
			onBuffering?.(true);
		};
		const onStalled = () => {
			log('media stalled');
			onBuffering?.(true);
		};
		const onSuspend = () => {
			if (__DEV__) console.debug('[VideoPlayer] media suspended');
		};
		const onMediaError = () => {
			// Catches native <video> errors (Safari native HLS, or any provider)
			try {
				const video = el.querySelector('video') as HTMLVideoElement | null;
				const err = video?.error;
				if (err) {
					log('native media error', { code: err.code, message: err.message });
					hasError = true;
					isPlaying = false;
					onError?.();
				}
			} catch {
				log('native media error (could not read details)');
			}
		};

		el.addEventListener('provider-change', onProviderChange);
		el.addEventListener('can-play', onCanPlay);
		el.addEventListener('waiting', onWaiting);
		el.addEventListener('stalled', onStalled);
		el.addEventListener('suspend', onSuspend);
		el.addEventListener('error', onMediaError);
		return () => {
			el.removeEventListener('provider-change', onProviderChange);
			el.removeEventListener('can-play', onCanPlay);
			el.removeEventListener('waiting', onWaiting);
			el.removeEventListener('stalled', onStalled);
			el.removeEventListener('suspend', onSuspend);
			el.removeEventListener('error', onMediaError);
		};
	});

	$effect(() => {
		if (!player) return;
		const el = player;

		const handleHlsError = (e: any) => {
			const detail = e?.detail ?? {};
			const errorDetails = detail.details ?? '';
			const isFatal = detail.fatal === true;
			const code = detail.response?.code;

			if (errorDetails === 'levelEmptyError') {
				emptyManifestCount += 1;
				// Log only the first occurrence and then every 10th to avoid flooding
				if (__DEV__ && (emptyManifestCount === 1 || emptyManifestCount % 10 === 0))
					console.debug(
						`[VideoPlayer] empty manifest — HLS.js will retry (×${emptyManifestCount})`
					);
				return;
			}

			// manifestParsingError / 204 = CF Stream hasn't produced HLS segments yet.
			// Non-fatal: HLS.js will retry internally.
			// Fatal: HLS.js has stopped — fall through to fatal handling so the
			// remount timer can recover with a fresh instance.
			if (!isFatal && (errorDetails === 'manifestParsingError' || code === 204)) {
				if (__DEV__) console.debug('[VideoPlayer] manifest not ready — waiting');
				return;
			}

			if (!isFatal) {
				if (errorDetails === 'bufferStalledError') {
					stallCount += 1;
					// HLS.js handles live-edge recovery via maxLiveSyncPlaybackRate
					// and liveMaxLatencyDurationCount — no manual seek needed.
					if (stallCount === 1 || stallCount % 5 === 0) log('buffer stall', { stalls: stallCount });
				} else if (__DEV__) {
					console.debug('[VideoPlayer] non-fatal HLS error:', errorDetails);
				}
				return;
			}

			log('fatal HLS error', { details: errorDetails });
			hasError = true;
			isPlaying = false;
			onError?.();
		};

		el.addEventListener('hls-error', handleHlsError);
		return () => el.removeEventListener('hls-error', handleHlsError);
	});

	$effect(() => {
		const onFsChange = () => {
			isFullscreen = !!document.fullscreenElement;
			posthog.capture('fullscreen_toggled', { is_fullscreen: isFullscreen });
		};

		document.addEventListener('fullscreenchange', onFsChange);
		return () => document.removeEventListener('fullscreenchange', onFsChange);
	});

	const fsLabel = $derived(isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen');

	const onLivePlaying = () => {
		onBuffering?.(false);
		if (isPlaying) return; // already reported
		log('playback started');
		isPlaying = true;
		hasError = false;
		stallCount = 0;

		// Seek to the live edge so the viewer isn't stuck on stale buffer.
		if (player) {
			try {
				const el = player as any;
				const duration = el.duration;
				if (Number.isFinite(duration) && duration > 0) {
					el.currentTime = duration;
					if (__DEV__) console.debug('[VideoPlayer] seeked to live edge', duration);
				}
			} catch {
				// non-critical — player will still play
			}
		}

		onPlaying?.();
	};

	$effect(() => {
		if (!hasError || !sessionActive || isPlaying) {
			clearTimeout(remountTimeout);
			return;
		}

		remountTimeout = setTimeout(() => {
			log('remounting after fatal error', { key: playerKey + 1 });
			playerKey += 1;
			hasError = false;
		}, 10_000);

		return () => clearTimeout(remountTimeout);
	});

	const toggleFullscreen = () => {
		if (!container) return;
		if (document.fullscreenElement) void document.exitFullscreen();
		else void container.requestFullscreen();
	};

	$effect(() => {
		if (__DEV__)
			console.debug('[VideoPlayer]', { manifestReady, isFullscreen, isPlaying, hasError });
	});
</script>

<div
	bind:this={container}
	class="group relative overflow-hidden bg-black {className ||
		'rounded-3xl border border-white/10 shadow-2xl shadow-black/30'}"
>
	{#if manifestReady}
		{#key playerKey}
			<media-player
				bind:this={player}
				title="River Stream"
				src={liveSrc}
				{poster}
				autoplay
				muted
				playsinline
				stream-type="live"
				class="absolute inset-0 z-0 h-full w-full"
				onplaying={onLivePlaying}
			>
				<media-outlet></media-outlet>
			</media-player>
		{/key}
	{/if}

	<!-- Explicit poster fallback to ensure it stays visible on error -->
	<img
		src={poster}
		alt="Stream Poster"
		class="pointer-events-none absolute inset-0 z-10 h-full w-full object-cover transition-opacity duration-500 {isPlaying &&
		!hasError
			? 'opacity-0'
			: 'opacity-100'}"
	/>

	<div
		class="absolute inset-x-0 bottom-0 z-20 flex items-center justify-end bg-linear-to-t from-black/70 to-transparent px-6 py-6 opacity-0 transition-all duration-300 ease-out group-hover:opacity-100"
	>
		<button
			onclick={toggleFullscreen}
			aria-label={fsLabel}
			disabled={!sessionActive}
			class="rounded-sm text-white/70 transition-all duration-200 focus-visible:outline-none {sessionActive
				? 'cursor-pointer hover:scale-110 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50 active:scale-95'
				: 'pointer-events-none opacity-0'}"
		>
			{#if isFullscreen}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="currentColor"
					class="size-5"
					aria-hidden="true"
				>
					<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
				</svg>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="currentColor"
					class="size-5"
					aria-hidden="true"
				>
					<path
						d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
					/>
				</svg>
			{/if}
		</button>
	</div>
</div>
