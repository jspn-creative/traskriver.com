<script lang="ts">
	import Hls from 'hls.js';
	import { defineCustomElements } from 'vidstack/elements';
	import defaultPoster from '$lib/assets/default.jpg';

	const STALL_THRESHOLD_MS = 30_000;

	let {
		liveSrc,
		poster = defaultPoster,
		class: className,
		onPlaying,
		onError,
		onBuffering,
		onDegraded,
		onRecovered
	} = $props<{
		liveSrc: string;
		poster?: string;
		class?: string;
		onPlaying?: () => void;
		onError?: () => void;
		onBuffering?: (buffering: boolean) => void;
		onDegraded?: () => void;
		onRecovered?: () => void;
	}>();

	let container = $state<HTMLDivElement>();
	let player = $state<any>();
	let isFullscreen = $state(false);
	let isPlaying = $state(false);
	let hasError = $state(false);
	let isDegraded = $state(false);
	let playerKey = $state(0);
	let remountTimeout: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		void defineCustomElements();
	});

	$effect(() => {
		if (!player) return;
		const el = player;
		let teardownHls: (() => void) | undefined;

		const onProviderChange = (event: any) => {
			const provider = event.detail;
			if (provider?.type !== 'hls') return;

			provider.config = {
				...provider.config,
				fragLoadingTimeOut: 20000,
				manifestLoadingTimeOut: 20000,
				levelLoadingTimeOut: 20000,
				liveSyncDurationCount: 3,
				liveMaxLatencyDurationCount: 5,
				maxLiveSyncPlaybackRate: 1.5,
				backBufferLength: 10
			};

			const hls = provider.instance;
			if (!hls?.on || !hls?.off) return;

			let lastMediaSequence = -1;
			let lastSequenceChangeTime = Date.now();
			const onLevelLoaded = (_event: string, data: any) => {
				const seq = data.details?.startSN ?? -1;
				if (seq !== lastMediaSequence) {
					lastMediaSequence = seq;
					lastSequenceChangeTime = Date.now();
					if (isDegraded) {
						isDegraded = false;
						onRecovered?.();
					}
				}
			};
			const stallCheck = setInterval(() => {
				if (
					!isDegraded &&
					lastMediaSequence >= 0 &&
					Date.now() - lastSequenceChangeTime > STALL_THRESHOLD_MS
				) {
					isDegraded = true;
					onDegraded?.();
				}
			}, 5_000);

			hls.on(Hls.Events.LEVEL_LOADED, onLevelLoaded);
			teardownHls?.();
			teardownHls = () => {
				clearInterval(stallCheck);
				hls.off(Hls.Events.LEVEL_LOADED, onLevelLoaded);
			};
		};

		const onCanPlay = () => onBuffering?.(false);
		const onWaiting = () => onBuffering?.(true);
		const onStalled = () => onBuffering?.(true);
		const onMediaError = () => {
			hasError = true;
			isPlaying = false;
			onError?.();
		};

		el.addEventListener('provider-change', onProviderChange);
		el.addEventListener('can-play', onCanPlay);
		el.addEventListener('waiting', onWaiting);
		el.addEventListener('stalled', onStalled);
		el.addEventListener('error', onMediaError);
		return () => {
			teardownHls?.();
			el.removeEventListener('provider-change', onProviderChange);
			el.removeEventListener('can-play', onCanPlay);
			el.removeEventListener('waiting', onWaiting);
			el.removeEventListener('stalled', onStalled);
			el.removeEventListener('error', onMediaError);
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
		onBuffering?.(false);
		isPlaying = true;
		hasError = false;
		try {
			const duration = player?.duration;
			if (Number.isFinite(duration) && duration > 0) player.currentTime = duration;
		} catch {
			// no-op: live seek can fail briefly while provider initializes
		}
		onPlaying?.();
	};

	$effect(() => {
		if (!hasError || isPlaying) {
			clearTimeout(remountTimeout);
			return;
		}
		remountTimeout = setTimeout(() => {
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
			disabled={!isPlaying}
			class="rounded-sm text-white/70 transition-all duration-200 focus-visible:outline-none {isPlaying
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
