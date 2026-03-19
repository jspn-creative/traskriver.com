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
		console.log('[river-stream][VideoPlayer]', ...args);
	};
	const logErr = (...args: unknown[]) => {
		if (!isBrowser) return;
		console.error('[river-stream][VideoPlayer]', ...args);
	};

	let container: HTMLDivElement | undefined = $state();
	let player: any = $state();
	let isFullscreen = $state(false);
	let isPlaying = $state(false);
	let hasError = $state(false);

	$effect(() => {
		// Initialize vidstack
		log('defineCustomElements()');
		void defineCustomElements();
	});

	$effect(() => {
		if (!player) return;

		const handleError = (e: any) => {
			// A 204 response (stream offline / not yet broadcasting) causes a
			// manifestParsingError. Treat it as standby — not a fatal error.
			const errorType = e?.detail?.type ?? e?.detail?.details ?? '';
			const details = e?.detail?.details ?? '';
			const code = e?.detail?.response?.code;
			const isOffline =
				errorType === 'manifestParsingError' || code === 204 || details === 'manifestParsingError';

			log('handleError(listener)', {
				errorType,
				details,
				code,
				isOffline
			});
			if (isOffline) return;

			logErr('Stream error:', e);
			hasError = true;
			isPlaying = false;
			onError?.();
		};

		log('attach listeners', {
			hasPlayer: !!player
		});
		player.addEventListener('error', handleError);
		player.addEventListener('provider-error', handleError);
		player.addEventListener('hls-error', handleError);
		player.addEventListener('fatal-error', handleError);

		return () => {
			log('cleanup listeners');
			player.removeEventListener('error', handleError);
			player.removeEventListener('provider-error', handleError);
			player.removeEventListener('hls-error', handleError);
			player.removeEventListener('fatal-error', handleError);
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
		log('onerror(media-player event)', {
			details,
			code,
			isOffline: details === 'manifestParsingError' || code === 204
		});
		if (details === 'manifestParsingError' || code === 204) return;

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
</script>

<div
	bind:this={container}
	class="group relative overflow-hidden bg-black {className ||
		'rounded-3xl border border-white/10 shadow-2xl shadow-black/30'}"
>
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
		onerror={onLiveError}
	>
		<media-outlet></media-outlet>
	</media-player>

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
