<script lang="ts">
	import { defineCustomElements } from 'vidstack/elements';
	import defaultPoster from '$lib/assets/default.jpg';

	const __DEV__ = import.meta.env.DEV;

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
	/** Only for last-resort remount after fatal HLS error */
	let playerKey = $state(0);

	let remountTimeout: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		void defineCustomElements();
	});

	$effect(() => {
		if (!player) return;
		const el = player;

		const onProviderChange = (e: any) => {
			const provider = e.detail;
			if (provider?.type === 'hls') {
				if (__DEV__) console.debug('[VideoPlayer] configuring HLS provider');
				provider.config = {
					...provider.config,
					fragLoadingTimeOut: 20000,
					manifestLoadingTimeOut: 20000,
					levelLoadingTimeOut: 20000,
					liveSyncDurationCount: 3,
					liveMaxLatencyDurationCount: 10
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
				if (__DEV__) console.debug('[VideoPlayer] empty manifest — HLS.js will retry');
				return;
			}

			if (errorDetails === 'manifestParsingError' || code === 204) {
				if (__DEV__) console.debug('[VideoPlayer] manifest not ready — waiting');
				return;
			}

			if (!isFatal) {
				if (__DEV__) console.debug('[VideoPlayer] non-fatal HLS error:', errorDetails);
				return;
			}

			console.warn('[VideoPlayer] fatal HLS error:', errorDetails);
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
		isPlaying = true;
		hasError = false;
		onPlaying?.();
	};

	$effect(() => {
		if (!hasError || !sessionActive || isPlaying) {
			clearTimeout(remountTimeout);
			return;
		}

		remountTimeout = setTimeout(() => {
			if (__DEV__) console.debug('[VideoPlayer] last-resort remount after fatal error');
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
			console.debug('[VideoPlayer]', { isFullscreen, isPlaying, hasError });
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
