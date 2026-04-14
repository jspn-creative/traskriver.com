<script lang="ts">
	import { defineCustomElements } from 'vidstack/elements';
	import defaultPoster from '$lib/assets/default.jpg';

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
		onError
	} = $props<{
		liveSrc: string;
		poster?: string;
		class?: string;
		sessionActive?: boolean;
		onPlaying?: () => void;
		onError?: () => void;
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

				if (!res.ok) {
					if (__DEV__) console.debug('[VideoPlayer] manifest probe:', res.status);
					if (!cancelled) setTimeout(probe, MANIFEST_PROBE_INTERVAL_MS);
					return;
				}

				const text = await res.text();
				if (cancelled) return;

				if (!text.includes('#EXTM3U')) {
					if (__DEV__) console.debug('[VideoPlayer] manifest not valid M3U yet');
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
						if (__DEV__)
							console.debug('[VideoPlayer] master manifest has no parseable rendition URI');
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
						if (__DEV__)
							console.debug('[VideoPlayer] rendition playlist exists but no segments yet');
					} else {
						if (__DEV__) console.debug('[VideoPlayer] rendition probe:', rendRes.status);
					}
				} else {
					if (__DEV__) console.debug('[VideoPlayer] manifest exists but no segments yet');
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
				log('HLS provider attached');
				provider.config = {
					...provider.config,
					fragLoadingTimeOut: 20000,
					manifestLoadingTimeOut: 20000,
					levelLoadingTimeOut: 20000,
					liveSyncDurationCount: 3,
					liveMaxLatencyDurationCount: 10,
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
			}
		};

		el.addEventListener('provider-change', onProviderChange);
		return () => el.removeEventListener('provider-change', onProviderChange);
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
				if (__DEV__) console.debug('[VideoPlayer] non-fatal HLS error:', errorDetails);
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
		};

		document.addEventListener('fullscreenchange', onFsChange);
		return () => document.removeEventListener('fullscreenchange', onFsChange);
	});

	const fsLabel = $derived(isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen');

	const onLivePlaying = () => {
		if (isPlaying) return; // already reported
		log('playback started');
		isPlaying = true;
		hasError = false;

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
