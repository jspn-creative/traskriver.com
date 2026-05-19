<script lang="ts">
	import { defineCustomElements } from 'vidstack/elements';
	import defaultPoster from '$lib/assets/default.jpg';
	import type { StreamDiagnostic } from '$lib/stream-diagnostics';
	const STALL_THRESHOLD_MS = 30_000;
	const STARTUP_SLOW_MS = 8_000;
	const STARTUP_HUNG_MS = 20_000;

	type VideoFrameMetadataLike = {
		mediaTime?: number;
		presentedFrames?: number;
		width?: number;
		height?: number;
	};

	type NativeVideoElement = HTMLVideoElement & {
		webkitDecodedFrameCount?: number;
		webkitDroppedFrameCount?: number;
		requestVideoFrameCallback?: (
			callback: (now: number, metadata: VideoFrameMetadataLike) => void
		) => number;
		cancelVideoFrameCallback?: (handle: number) => void;
	};

	let {
		liveSrc,
		poster = defaultPoster,
		class: className,
		onPlaying,
		onError,
		onBuffering,
		onDegraded,
		onRecovered,
		onDiagnostic
	} = $props<{
		liveSrc: string;
		poster?: string;
		class?: string;
		onPlaying?: () => void;
		onError?: () => void;
		onBuffering?: (buffering: boolean) => void;
		onDegraded?: () => void;
		onRecovered?: () => void;
		onDiagnostic?: (diagnostic: StreamDiagnostic) => void;
	}>();
	let container = $state<HTMLDivElement>();
	let player = $state<any>();
	let isFullscreen = $state(false);
	let isPlaying = $state(false);
	let hasError = $state(false);
	let isDegraded = $state(false);
	let playerKey = $state(0);
	let remountTimeout: ReturnType<typeof setTimeout> | undefined;

	const readBufferedEnd = (el: any) => {
		try {
			const buffered = el?.buffered;
			if (!buffered?.length) return null;
			return Number(buffered.end(buffered.length - 1)) || null;
		} catch {
			return null;
		}
	};

	const readMediaError = (el: any) => {
		const error = el?.error;
		return {
			errorCode: typeof error?.code === 'number' ? error.code : null,
			errorMessage: typeof error?.message === 'string' ? error.message : null
		};
	};

	const snapshot = (
		el: any,
		video: NativeVideoElement | null,
		startedAt: number,
		detail?: Record<string, unknown>
	): StreamDiagnostic => {
		const mediaError = readMediaError(el);
		return {
			type: '',
			elapsedMs: Date.now() - startedAt,
			playerKey,
			currentTime: Number.isFinite(Number(el?.currentTime)) ? Number(el.currentTime) : null,
			paused: typeof el?.paused === 'boolean' ? el.paused : null,
			readyState: typeof el?.readyState === 'number' ? el.readyState : null,
			networkState: typeof el?.networkState === 'number' ? el.networkState : null,
			bufferedEnd: readBufferedEnd(el),
			...mediaError,
			videoCurrentTime: Number.isFinite(Number(video?.currentTime))
				? Number(video?.currentTime)
				: null,
			videoPaused: typeof video?.paused === 'boolean' ? video.paused : null,
			videoReadyState: typeof video?.readyState === 'number' ? video.readyState : null,
			videoNetworkState: typeof video?.networkState === 'number' ? video.networkState : null,
			videoWidth: typeof video?.videoWidth === 'number' ? video.videoWidth : null,
			videoHeight: typeof video?.videoHeight === 'number' ? video.videoHeight : null,
			videoDecodedFrameCount:
				typeof video?.webkitDecodedFrameCount === 'number' ? video.webkitDecodedFrameCount : null,
			videoDroppedFrameCount:
				typeof video?.webkitDroppedFrameCount === 'number' ? video.webkitDroppedFrameCount : null,
			detail
		};
	};

	$effect(() => void defineCustomElements());
	$effect(() => {
		if (!player) return;
		const el = player;
		const startedAt = Date.now();
		let teardownHls: (() => void) | undefined;
		let teardownNativeVideo: (() => void) | undefined;
		let bufferingTimeout: ReturnType<typeof setTimeout> | undefined;
		let startupSlowTimer: ReturnType<typeof setTimeout> | undefined;
		let startupHungTimer: ReturnType<typeof setTimeout> | undefined;
		let fragLoadedCount = 0;
		let levelLoadedCount = 0;
		let nativeVideo: NativeVideoElement | null = null;
		let videoFrameCallbackHandle: number | undefined;

		const emitDiagnostic = (type: string, detail?: Record<string, unknown>) => {
			const diagnostic = { ...snapshot(el, nativeVideo, startedAt, detail), type };
			onDiagnostic?.(diagnostic);
		};

		const clearBufferingTimeout = () => {
			if (!bufferingTimeout) return;
			clearTimeout(bufferingTimeout);
			bufferingTimeout = undefined;
		};
		const clearStartupTimers = () => {
			clearTimeout(startupSlowTimer);
			clearTimeout(startupHungTimer);
			startupSlowTimer = undefined;
			startupHungTimer = undefined;
		};
		const markPlaybackStarted = (source: string) => {
			clearStartupTimers();
			clearBuffering();
			if (isPlaying) return;
			emitDiagnostic('playback_confirmed', { source });
			isPlaying = true;
			hasError = false;
			onPlaying?.();
		};
		const emitStartupCheck = (type: string) => {
			if (isPlaying || hasError) return;
			emitDiagnostic(type, { src: liveSrc });
		};
		startupSlowTimer = setTimeout(() => emitStartupCheck('startup_slow'), STARTUP_SLOW_MS);
		startupHungTimer = setTimeout(() => emitStartupCheck('startup_hung'), STARTUP_HUNG_MS);
		emitDiagnostic('player_mounted', { src: liveSrc });

		const videoHasCurrentFrame = (video: NativeVideoElement) =>
			video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
			video.videoWidth > 0 &&
			video.videoHeight > 0;
		const hasVideoFrameCallback = (video: NativeVideoElement | null) =>
			typeof (video as { requestVideoFrameCallback?: unknown } | null)
				?.requestVideoFrameCallback === 'function';

		const requestFirstVideoFrame = () => {
			if (
				!nativeVideo ||
				!hasVideoFrameCallback(nativeVideo) ||
				videoFrameCallbackHandle !== undefined
			) {
				return;
			}
			const requestVideoFrameCallback = nativeVideo.requestVideoFrameCallback as NonNullable<
				NativeVideoElement['requestVideoFrameCallback']
			>;
			videoFrameCallbackHandle = requestVideoFrameCallback.call(nativeVideo, (_now, metadata) => {
				videoFrameCallbackHandle = undefined;
				emitDiagnostic('video_frame', {
					mediaTime: metadata.mediaTime ?? null,
					presentedFrames: metadata.presentedFrames ?? null,
					width: metadata.width ?? null,
					height: metadata.height ?? null
				});
				markPlaybackStarted('video_frame');
			});
		};

		const attachNativeVideo = (video: NativeVideoElement | null) => {
			if (video === nativeVideo) return;
			teardownNativeVideo?.();
			nativeVideo = video;
			if (!video) return;

			const maybeConfirmWithoutFrameCallback = (source: string) => {
				if (hasVideoFrameCallback(video)) {
					requestFirstVideoFrame();
					return;
				}
				if (!video.paused && videoHasCurrentFrame(video)) markPlaybackStarted(source);
			};
			const onNativeLoadedMetadata = () => emitDiagnostic('native_video_loaded_metadata');
			const onNativeLoadedData = () => {
				emitDiagnostic('native_video_loaded_data');
				maybeConfirmWithoutFrameCallback('native_loaded_data');
			};
			const onNativeCanPlay = () => {
				emitDiagnostic('native_video_can_play');
				maybeConfirmWithoutFrameCallback('native_can_play');
			};
			const onNativePlaying = () => {
				emitDiagnostic('native_video_playing');
				maybeConfirmWithoutFrameCallback('native_playing');
			};
			const onNativeResize = () => {
				emitDiagnostic('native_video_resize');
				maybeConfirmWithoutFrameCallback('native_resize');
			};
			const onNativeWaiting = () => emitDiagnostic('native_video_waiting');
			const onNativeStalled = () => emitDiagnostic('native_video_stalled');
			const onNativeError = () => emitDiagnostic('native_video_error');

			video.addEventListener('loadedmetadata', onNativeLoadedMetadata);
			video.addEventListener('loadeddata', onNativeLoadedData);
			video.addEventListener('canplay', onNativeCanPlay);
			video.addEventListener('playing', onNativePlaying);
			video.addEventListener('resize', onNativeResize);
			video.addEventListener('waiting', onNativeWaiting);
			video.addEventListener('stalled', onNativeStalled);
			video.addEventListener('error', onNativeError);
			emitDiagnostic('native_video_attached');
			maybeConfirmWithoutFrameCallback('native_video_attached');

			teardownNativeVideo = () => {
				if (videoFrameCallbackHandle !== undefined) {
					video.cancelVideoFrameCallback?.(videoFrameCallbackHandle);
					videoFrameCallbackHandle = undefined;
				}
				video.removeEventListener('loadedmetadata', onNativeLoadedMetadata);
				video.removeEventListener('loadeddata', onNativeLoadedData);
				video.removeEventListener('canplay', onNativeCanPlay);
				video.removeEventListener('playing', onNativePlaying);
				video.removeEventListener('resize', onNativeResize);
				video.removeEventListener('waiting', onNativeWaiting);
				video.removeEventListener('stalled', onNativeStalled);
				video.removeEventListener('error', onNativeError);
			};
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
			emitDiagnostic('provider_change', { providerType: provider?.type ?? null });
			attachNativeVideo((provider?.video ?? provider?.media ?? null) as NativeVideoElement | null);
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
			const events = provider.library?.Events ?? {};
			const eventName = (key: string, fallback: string) => events[key] ?? fallback;
			const MANIFEST_LOADED = eventName('MANIFEST_LOADED', 'hlsManifestLoaded');
			const LEVEL_LOADED = eventName('LEVEL_LOADED', 'hlsLevelLoaded');
			const FRAG_LOADED = eventName('FRAG_LOADED', 'hlsFragLoaded');
			const ERROR = eventName('ERROR', 'hlsError');
			let lastMediaSequence = -1;
			let lastSequenceChangeTime = Date.now();
			const onLevelLoaded = (_event: string, data: any) => {
				const seq = data.details?.startSN ?? -1;
				levelLoadedCount += 1;
				if (levelLoadedCount <= 3 || levelLoadedCount % 10 === 0) {
					emitDiagnostic('hls_level_loaded', {
						levelLoadedCount,
						mediaSequence: seq,
						live: data.details?.live ?? null,
						fragmentCount: data.details?.fragments?.length ?? null,
						targetDuration: data.details?.targetduration ?? null,
						totalDuration: data.details?.totalduration ?? null
					});
				}
				if (seq !== lastMediaSequence) {
					lastMediaSequence = seq;
					lastSequenceChangeTime = Date.now();
					if (isDegraded) {
						isDegraded = false;
						onRecovered?.();
					}
				}
			};
			const onManifestLoaded = (_event: string, data: any) => {
				emitDiagnostic('hls_manifest_loaded', {
					levelCount: data.levels?.length ?? null,
					audioTracks: data.audioTracks?.length ?? null,
					url: data.url ?? null
				});
			};
			const onFragLoaded = (_event: string, data: any) => {
				fragLoadedCount += 1;
				if (fragLoadedCount <= 3 || fragLoadedCount % 10 === 0) {
					emitDiagnostic('hls_frag_loaded', {
						fragLoadedCount,
						sn: data.frag?.sn ?? null,
						level: data.frag?.level ?? null,
						duration: data.frag?.duration ?? null,
						url: data.frag?.url ?? null
					});
				}
			};
			const onHlsError = (_event: string, data: any) => {
				emitDiagnostic('hls_error', {
					hlsType: data.type ?? null,
					details: data.details ?? null,
					fatal: data.fatal ?? null,
					responseCode: data.response?.code ?? null,
					url: data.context?.url ?? data.frag?.url ?? null
				});
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
			hls.on(MANIFEST_LOADED, onManifestLoaded);
			hls.on(LEVEL_LOADED, onLevelLoaded);
			hls.on(FRAG_LOADED, onFragLoaded);
			hls.on(ERROR, onHlsError);
			teardownHls?.();
			teardownHls = () => {
				clearInterval(stallCheck);
				hls.off(MANIFEST_LOADED, onManifestLoaded);
				hls.off(LEVEL_LOADED, onLevelLoaded);
				hls.off(FRAG_LOADED, onFragLoaded);
				hls.off(ERROR, onHlsError);
			};
		};
		const onCanPlay = () => {
			emitDiagnostic('media_can_play');
			clearBuffering();
			requestFirstVideoFrame();
		};
		const onMediaPlaying = () => {
			emitDiagnostic('media_playing');
			requestFirstVideoFrame();
		};
		const onTimeUpdate = () => {
			clearBuffering();
		};
		const onWaiting = () => {
			emitDiagnostic('media_waiting');
			setBufferingSoon();
		};
		const onStalled = () => {
			emitDiagnostic('media_stalled');
			setBufferingSoon();
		};
		const onMediaError = () => {
			clearBufferingTimeout();
			clearStartupTimers();
			emitDiagnostic('media_error');
			hasError = true;
			isPlaying = false;
			onError?.();
		};
		el.addEventListener('provider-change', onProviderChange);
		el.addEventListener('can-play', onCanPlay);
		el.addEventListener('playing', onMediaPlaying);
		el.addEventListener('timeupdate', onTimeUpdate);
		el.addEventListener('time-update', onTimeUpdate);
		el.addEventListener('waiting', onWaiting);
		el.addEventListener('stalled', onStalled);
		el.addEventListener('error', onMediaError);
		return () => {
			teardownHls?.();
			teardownNativeVideo?.();
			clearBufferingTimeout();
			clearStartupTimers();
			el.removeEventListener('provider-change', onProviderChange);
			el.removeEventListener('can-play', onCanPlay);
			el.removeEventListener('playing', onMediaPlaying);
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
