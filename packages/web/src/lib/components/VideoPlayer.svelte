<script lang="ts">
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
	$effect(() => void defineCustomElements());
	$effect(() => {
		if (!player) return;
		const el = player;
		let teardownHls: (() => void) | undefined;
		let bufferingTimeout: ReturnType<typeof setTimeout> | undefined;
		const clearBufferingTimeout = () => {
			if (!bufferingTimeout) return;
			clearTimeout(bufferingTimeout);
			bufferingTimeout = undefined;
		};
		const setBufferingSoon = () => {
			clearBufferingTimeout();
			const startTime = Number(el.currentTime) || 0;
			bufferingTimeout = setTimeout(() => {
				const nowTime = Number(el.currentTime) || 0;
				const advanced = nowTime - startTime > 0.2;
				const paused = !!el.paused;
				if (!advanced && !paused) onBuffering?.(true);
				bufferingTimeout = undefined;
			}, 1200);
		};
		const clearBuffering = () => {
			clearBufferingTimeout();
			onBuffering?.(false);
		};
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
			const LEVEL_LOADED = provider.library?.Events?.LEVEL_LOADED ?? 'hlsLevelLoaded';
			hls.on(LEVEL_LOADED, onLevelLoaded);
			teardownHls?.();
			teardownHls = () => {
				clearInterval(stallCheck);
				hls.off(LEVEL_LOADED, onLevelLoaded);
			};
		};
		const onCanPlay = () => clearBuffering();
		const onPlaying = () => clearBuffering();
		const onTimeUpdate = () => clearBuffering();
		const onWaiting = () => setBufferingSoon();
		const onStalled = () => setBufferingSoon();
		const onMediaError = () => {
			clearBufferingTimeout();
			hasError = true;
			isPlaying = false;
			onError?.();
		};
		el.addEventListener('provider-change', onProviderChange);
		el.addEventListener('can-play', onCanPlay);
		el.addEventListener('playing', onPlaying);
		el.addEventListener('timeupdate', onTimeUpdate);
		el.addEventListener('time-update', onTimeUpdate);
		el.addEventListener('waiting', onWaiting);
		el.addEventListener('stalled', onStalled);
		el.addEventListener('error', onMediaError);
		return () => {
			teardownHls?.();
			clearBufferingTimeout();
			el.removeEventListener('provider-change', onProviderChange);
			el.removeEventListener('can-play', onCanPlay);
			el.removeEventListener('playing', onPlaying);
			el.removeEventListener('timeupdate', onTimeUpdate);
			el.removeEventListener('time-update', onTimeUpdate);
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
	const fsText = $derived(isFullscreen ? 'Exit' : 'Fullscreen');
	const onLivePlaying = () => {
		onBuffering?.(false);
		isPlaying = true;
		hasError = false;
		try {
			const duration = player?.duration;
			if (Number.isFinite(duration) && duration > 0) player.currentTime = duration;
		} catch {}
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
			{fsText}
		</button>
	</div>
</div>
