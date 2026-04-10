<script lang="ts">
	import { defineCustomElements } from 'vidstack/elements';
	import defaultPoster from '$lib/assets/default.jpg';

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

	const isBrowser = typeof window !== 'undefined';
	const log = (...args: unknown[]) => {
		if (!isBrowser) return;
		console.log('[traskriver][VideoPlayer]', ...args);
	};
	const logErr = (...args: unknown[]) => {
		if (!isBrowser) return;
		console.error('[traskriver][VideoPlayer]', ...args);
	};

	let container: HTMLDivElement | undefined = $state();
	let player: any = $state();
	let isFullscreen = $state(false);
	let isPlaying = $state(false);
	let hasError = $state(false);
	// Incrementing this key destroys and remounts <media-player>, giving
	// HLS.js a fresh start after a fatal 204/manifestParsingError.
	let playerKey = $state(0);

	const RETRY_INTERVAL_MS = 4_000;

	// Derive a cache-busted manifest URL that changes on every remount.
	// Each {#key playerKey} cycle creates a new HLS.js instance that fetches
	// the manifest. Without a unique URL, the browser's HTTP cache may serve a
	// stale 204 response (CF Stream returns 204 when a signed-URL manifest is
	// first requested and the CDN edge hasn't cached the live manifest yet).
	// Appending a query param makes each attempt a unique URL, guaranteeing a
	// fresh request reaches CF Stream's origin on every retry.
	let cacheBustedSrc = $derived(liveSrc + (liveSrc.includes('?') ? '&' : '?') + '_cb=' + playerKey);

	$effect(() => {
		// Initialize vidstack
		log('defineCustomElements()');
		void defineCustomElements();
	});

	$effect(() => {
		if (!player) return;
		// Capture the element reference now. By the time the cleanup runs,
		// {#key playerKey} will have set `player` to null via bind:this, so
		// reading `player` directly in cleanup would throw a null-pointer error.
		const el = player;

		const onProviderChange = (e: any) => {
			const provider = e.detail;
			if (provider?.type === 'hls') {
				log('Configuring HLS provider');
				provider.config = {
					...provider.config,
					// Increase timeouts to be more resilient to slow network/stream
					fragLoadingTimeOut: 20000,
					manifestLoadingTimeOut: 20000,
					levelLoadingTimeOut: 20000,
					// Live stream specific configs
					liveSyncDurationCount: 3,
					liveMaxLatencyDurationCount: 10,
					// Bypass browser HTTP cache for manifest requests. CF Stream
					// may return 204 for a signed-URL manifest the first time it's
					// requested at a CDN edge; without cache-busting the browser
					// serves the stale 204 on every retry.
					xhrSetup: (xhr: XMLHttpRequest) => {
						xhr.setRequestHeader('Cache-Control', 'no-cache, no-store');
					}
				};
			}
		};

		el.addEventListener('provider-change', onProviderChange);
		return () => el.removeEventListener('provider-change', onProviderChange);
	});

	$effect(() => {
		if (!player) return;
		// Capture the element reference now. By the time the cleanup runs,
		// {#key playerKey} will have set `player` to null via bind:this, so
		// reading `player` directly in cleanup would throw a null-pointer error.
		const el = player;

		const handleError = (e: any) => {
			// A 204 response (stream offline / not yet broadcasting) causes a
			// manifestParsingError. Treat it as standby — not a fatal error.
			const errorType = e?.detail?.type ?? e?.detail?.details ?? '';
			const details = e?.detail?.details ?? '';
			const code = e?.detail?.response?.code;
			const isFatal = e?.detail?.fatal !== false; // HLS.js sets fatal:false for recoverable errors
			const isOffline =
				errorType === 'manifestParsingError' || code === 204 || details === 'manifestParsingError';

			log('handleError(listener)', {
				errorType,
				details,
				code,
				isOffline,
				isFatal
			});
			if (isOffline) return;

			// Non-fatal HLS errors (e.g. bufferStalledError in Safari) are recoverable —
			// log them but don't surface the error UI or call onError.
			if (!isFatal) {
				log('non-fatal hls error, ignoring', { details });

				// Nudge the player if it stalls due to a fragment timeout
				if (
					details === 'fragLoadTimeOut' &&
					sessionActive &&
					el &&
					typeof (el as any).play === 'function' &&
					!isPlaying
				) {
					log('Attempting to recover from fragLoadTimeOut');
					try {
						(el as any).play()?.catch(() => {});
					} catch (_e) {}
				}
				return;
			}

			logErr('Stream error:', e);
			hasError = true;
			isPlaying = false;
			onError?.();
		};

		log('attach listeners', {
			hasPlayer: !!el
		});
		el.addEventListener('error', handleError);
		el.addEventListener('provider-error', handleError);
		el.addEventListener('hls-error', handleError);
		el.addEventListener('fatal-error', handleError);

		return () => {
			log('cleanup listeners');
			el.removeEventListener('error', handleError);
			el.removeEventListener('provider-error', handleError);
			el.removeEventListener('hls-error', handleError);
			el.removeEventListener('fatal-error', handleError);
		};
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
		log('onplaying');
		isPlaying = true;
		hasError = false;
		onPlaying?.();
	};

	const onLiveError = (e: any) => {
		// 204 / manifestParsingError = stream offline, not a fatal error
		const details = e?.detail?.details ?? e?.detail?.type ?? '';
		const code = e?.detail?.response?.code;
		const isFatal = e?.detail?.fatal !== false; // HLS.js sets fatal:false for recoverable errors
		log('onerror(media-player event)', {
			details,
			code,
			isFatal,
			isOffline: details === 'manifestParsingError' || code === 204
		});
		if (details === 'manifestParsingError' || code === 204) return;

		// Non-fatal HLS errors (e.g. bufferStalledError in Safari) are recoverable —
		// log them but don't surface the error UI or call onError.
		if (!isFatal) {
			log('non-fatal hls error, ignoring', { details });

			// Nudge the player if it stalls due to a fragment timeout
			if (
				details === 'fragLoadTimeOut' &&
				sessionActive &&
				player &&
				typeof player.play === 'function' &&
				!isPlaying
			) {
				log('Attempting to recover from fragLoadTimeOut');
				try {
					player.play()?.catch(() => {});
				} catch (_e) {}
			}
			return;
		}

		hasError = true;
		isPlaying = false;
		onError?.();
	};

	const toggleFullscreen = () => {
		log('toggleFullscreen');
		if (!container) return;
		if (document.fullscreenElement) void document.exitFullscreen();
		else void container.requestFullscreen();
	};

	$effect(() => {
		// Helps correlate "Safari batch of same error" with player state flips
		log('state', { isFullscreen, isPlaying, hasError });
	});

	$effect(() => {
		// Diagnostic: log the full HLS URL so it can be curl-tested and the JWT
		// sub (= live input UID) can be decoded and cross-checked in CF dashboard.
		log('liveSrc', liveSrc);
		log('cacheBustedSrc', cacheBustedSrc);
	});

	// Retry playback by remounting <media-player> periodically while session is
	// active but video isn't playing. After a fatal 204/manifestParsingError HLS.js
	// stops all loading — calling player.play() is rejected with "media is not
	// ready". The only reliable recovery is to destroy the element and create a
	// fresh HLS.js instance. Incrementing `playerKey` triggers {#key playerKey}
	// which remounts <media-player>. The new element has autoplay so it will start
	// playing once the manifest becomes available without any explicit play() call.
	$effect(() => {
		if (!sessionActive || isPlaying) return;

		log('starting remount retry loop');

		// Retry on interval until playback starts or session ends
		const id = setInterval(() => {
			if (isPlaying) {
				clearInterval(id);
				return;
			}
			log('remounting player (retry)');
			// Do NOT set player = undefined here. {#key playerKey} destroys the
			// old <media-player> element and bind:this nulls `player` automatically.
			// Explicitly setting player=undefined before the key change fires the
			// cleanup immediately with player already null, causing TypeErrors.
			playerKey += 1;
		}, RETRY_INTERVAL_MS);

		return () => {
			clearInterval(id);
		};
	});
</script>

<div
	bind:this={container}
	class="group relative overflow-hidden bg-black {className ||
		'rounded-3xl border border-white/10 shadow-2xl shadow-black/30'}"
>
	{#key playerKey}
		<media-player
			bind:this={player}
			title="River Stream"
			src={cacheBustedSrc}
			{poster}
			autoplay
			muted
			playsinline
			stream-type="live"
			class="absolute inset-0 z-0 h-full w-full"
			onplaying={onLivePlaying}
			onerror={onLiveError}
		>
			<media-outlet></media-outlet>
		</media-player>
	{/key}

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
