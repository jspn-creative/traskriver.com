<script lang="ts">
	import { untrack } from 'svelte';
	import {
		collectStreamCapabilities,
		readBufferedEnd,
		readHlsState,
		readMediaError,
		readVideoSnapshot,
		type NativeVideoElement,
		type StreamDiagnostic
	} from '$lib/stream-diagnostics';

	const STARTUP_SLOW_MS = 8_000;
	const STARTUP_HUNG_MS = 20_000;
	const FRAME_CALLBACK_GRACE_MS = 1_500;
	const STALL_THRESHOLD_MS = 30_000;

	type VideoFrameMetadataLike = {
		mediaTime?: number;
		presentedFrames?: number;
		width?: number;
		height?: number;
	};

	let {
		liveSrc,
		class: className,
		onPlaying,
		onError,
		onBuffering,
		onDegraded,
		onRecovered,
		onDiagnostic
	} = $props<{
		liveSrc: string;
		class?: string;
		onPlaying?: () => void;
		onError?: () => void;
		onBuffering?: (buffering: boolean) => void;
		onDegraded?: () => void;
		onRecovered?: () => void;
		onDiagnostic?: (diagnostic: StreamDiagnostic) => void;
	}>();

	let container = $state<HTMLDivElement>();
	let video = $state<NativeVideoElement>();
	let isFullscreen = $state(false);
	let isPlaying = $state(false);
	let hasError = $state(false);
	let isDegraded = $state(false);
	let playerKey = $state(0);
	let remountTimeout: ReturnType<typeof setTimeout> | undefined;

	const snapshot = (
		el: NativeVideoElement | null,
		startedAt: number,
		detail?: Record<string, unknown>
	): StreamDiagnostic => ({
		type: '',
		elapsedMs: Date.now() - startedAt,
		playerKey,
		currentTime: Number.isFinite(Number(el?.currentTime)) ? Number(el?.currentTime) : null,
		paused: typeof el?.paused === 'boolean' ? el.paused : null,
		readyState: typeof el?.readyState === 'number' ? el.readyState : null,
		networkState: typeof el?.networkState === 'number' ? el.networkState : null,
		bufferedEnd: readBufferedEnd(el),
		...readMediaError(el),
		...readVideoSnapshot(el),
		detail
	});

	const hasVideoFrameCallback = (el: NativeVideoElement | null) =>
		typeof el?.requestVideoFrameCallback === 'function';

	const videoHasCurrentFrame = (el: NativeVideoElement) =>
		el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && el.videoWidth > 0 && el.videoHeight > 0;

	const isDocumentHidden = () =>
		typeof document !== 'undefined' && document.visibilityState === 'hidden';

	const hasPlayableEvidence = (el: NativeVideoElement) =>
		videoHasCurrentFrame(el) ||
		(el.readyState >= HTMLMediaElement.HAVE_METADATA &&
			(el.videoWidth > 0 ||
				el.videoHeight > 0 ||
				readBufferedEnd(el) !== null ||
				(Number(el.currentTime) || 0) > 0));

	const isAbortPlayRejection = (err: Error) =>
		err.name === 'AbortError' || /interrupted|aborted|save power/i.test(err.message ?? '');

	$effect(() => {
		const el = video;
		if (!el) return;

		const startedAt = Date.now();
		let hlsInstance: unknown;
		let teardownHls: (() => void) | undefined;
		let bufferingTimeout: ReturnType<typeof setTimeout> | undefined;
		let startupSlowTimer: ReturnType<typeof setTimeout> | undefined;
		let startupHungTimer: ReturnType<typeof setTimeout> | undefined;
		let videoFrameCallbackHandle: number | undefined;
		let frameCallbackGraceTimer: ReturnType<typeof setTimeout> | undefined;
		let firstFrameSeen = false;
		let playDeferredHidden = false;
		let pendingPlaySource: string | null = null;
		let hlsFallbackStarted = false;
		let lastMediaSequence = -1;
		let lastSequenceChangeTime = Date.now();
		let nativeSrcCleared = false;

		type HlsLoader = { stopLoad: () => void; startLoad: (startPosition?: number) => void };
		const getHlsLoader = () => hlsInstance as HlsLoader | undefined;

		const emitDiagnostic = (type: string, detail?: Record<string, unknown>) => {
			const diagnostic = untrack(() => ({ ...snapshot(el, startedAt, detail), type }));
			queueMicrotask(() => onDiagnostic?.(diagnostic));
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

		const clearBuffering = () => {
			clearBufferingTimeout();
			onBuffering?.(false);
		};

		const clearFrameCallbackGrace = () => {
			if (!frameCallbackGraceTimer) return;
			clearTimeout(frameCallbackGraceTimer);
			frameCallbackGraceTimer = undefined;
		};

		const markPlaybackStarted = (
			source: string,
			diagnosticType: 'playback_confirmed' | 'playback_ready_fallback' = 'playback_confirmed'
		) => {
			clearStartupTimers();
			clearFrameCallbackGrace();
			clearBuffering();
			playDeferredHidden = false;
			pendingPlaySource = null;
			if (isPlaying) return;
			emitDiagnostic(diagnosticType, { source });
			isPlaying = true;
			hasError = false;
			onPlaying?.();
		};

		const requestFirstVideoFrame = () => {
			if (firstFrameSeen || videoFrameCallbackHandle !== undefined) return;
			if (!hasVideoFrameCallback(el)) {
				if (!el.paused && videoHasCurrentFrame(el)) {
					firstFrameSeen = true;
					emitDiagnostic('video_frame_fallback');
					markPlaybackStarted('video_frame_fallback');
				}
				return;
			}

			const requestVideoFrameCallback = el.requestVideoFrameCallback as NonNullable<
				NativeVideoElement['requestVideoFrameCallback']
			>;
			videoFrameCallbackHandle = requestVideoFrameCallback.call(
				el,
				(_now: number, metadata: VideoFrameMetadataLike) => {
					videoFrameCallbackHandle = undefined;
					firstFrameSeen = true;
					emitDiagnostic('video_frame', {
						mediaTime: metadata.mediaTime ?? null,
						presentedFrames: metadata.presentedFrames ?? null,
						width: metadata.width ?? null,
						height: metadata.height ?? null
					});
					markPlaybackStarted('video_frame');
				}
			);
		};

		const schedulePlaybackReadyFallback = (source: string) => {
			if (frameCallbackGraceTimer || !hasPlayableEvidence(el)) return;
			frameCallbackGraceTimer = setTimeout(() => {
				frameCallbackGraceTimer = undefined;
				if (firstFrameSeen || isPlaying || hasError || !hasPlayableEvidence(el)) return;
				firstFrameSeen = true;
				markPlaybackStarted(source, 'playback_ready_fallback');
			}, FRAME_CALLBACK_GRACE_MS);
		};

		const maybeConfirmPlaybackReady = (source: string) => {
			if (isPlaying) return;
			if (hasVideoFrameCallback(el)) {
				requestFirstVideoFrame();
				schedulePlaybackReadyFallback(source);
				return;
			}
			if (!el.paused && videoHasCurrentFrame(el)) {
				markPlaybackStarted(source);
				return;
			}
			if (
				!el.paused &&
				hasPlayableEvidence(el) &&
				el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
			) {
				markPlaybackStarted(source, 'playback_ready_fallback');
			}
		};

		const shouldDeferStartupFailure = () =>
			isDocumentHidden() ||
			playDeferredHidden ||
			(hasPlayableEvidence(el) && el.paused && el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);

		const emitStartupCheck = (type: string) => {
			if (isPlaying || hasError || shouldDeferStartupFailure()) return;
			emitDiagnostic(type, {
				src: liveSrc,
				capabilities: collectStreamCapabilities(el),
				hlsState: readHlsState(hlsInstance),
				visibility_state: typeof document === 'undefined' ? null : document.visibilityState,
				play_deferred_hidden: playDeferredHidden
			});
		};

		const setBufferingSoon = () => {
			clearBufferingTimeout();
			const startTime = Number(el.currentTime) || 0;
			bufferingTimeout = setTimeout(() => {
				const nowTime = Number(el.currentTime) || 0;
				const advanced = nowTime - startTime > 0.2;
				if (!advanced && !el.paused) onBuffering?.(true);
				bufferingTimeout = undefined;
			}, 1200);
		};

		const tryPlay = async (source: string) => {
			if (isDocumentHidden()) {
				playDeferredHidden = true;
				pendingPlaySource = source;
				emitDiagnostic('play_deferred_hidden', {
					source,
					visibility_state: document.visibilityState
				});
				maybeConfirmPlaybackReady('play_deferred_hidden');
				return;
			}

			try {
				await el.play();
				playDeferredHidden = false;
				pendingPlaySource = null;
				emitDiagnostic('play_promise_resolved', { source });
				requestFirstVideoFrame();
				maybeConfirmPlaybackReady('play_promise_resolved');
			} catch (error) {
				const err = error as Error;
				if (isDocumentHidden() || (isAbortPlayRejection(err) && hasPlayableEvidence(el))) {
					playDeferredHidden = true;
					pendingPlaySource = source;
					emitDiagnostic(isDocumentHidden() ? 'play_deferred_hidden' : 'play_deferred_abort', {
						source,
						name: err.name ?? null,
						message: err.message ?? null,
						visibility_state: document.visibilityState
					});
					maybeConfirmPlaybackReady(
						isDocumentHidden() ? 'play_deferred_hidden' : 'play_deferred_abort'
					);
					return;
				}
				emitDiagnostic('play_promise_rejected', {
					source,
					name: err.name ?? null,
					message: err.message ?? null,
					visibility_state: document.visibilityState
				});
			}
		};

		const stopLoading = () => {
			const hls = getHlsLoader();
			if (hls?.stopLoad) {
				hls.stopLoad();
				return;
			}
			if (el.src) {
				nativeSrcCleared = true;
				el.removeAttribute('src');
				el.load();
			}
		};

		const startLoading = () => {
			if (isDocumentHidden()) return;
			const hls = getHlsLoader();
			if (hls?.startLoad) {
				hls.startLoad(-1);
				return;
			}
			if (nativeSrcCleared || !el.src) {
				el.src = liveSrc;
				el.load();
				nativeSrcCleared = false;
			}
		};

		const onVisibilityChange = () => {
			if (isDocumentHidden()) {
				stopLoading();
				return;
			}
			startLoading();
			if (hasError) return;
			if (playDeferredHidden || pendingPlaySource) {
				void tryPlay(pendingPlaySource ?? 'visibility_retry');
				return;
			}
			if (isPlaying) {
				void tryPlay('visibility_resume');
				return;
			}
			emitDiagnostic('visibility_visible_retry', {
				visibility_state: document.visibilityState,
				play_deferred_hidden: playDeferredHidden
			});
			if (hasPlayableEvidence(el)) maybeConfirmPlaybackReady('visibility_ready');
			else void tryPlay('visibility_retry');
		};
		document.addEventListener('visibilitychange', onVisibilityChange);

		const eventListeners: Array<() => void> = [];
		const listen = (name: keyof HTMLMediaElementEventMap, listener: EventListener) => {
			el.addEventListener(name, listener);
			eventListeners.push(() => el.removeEventListener(name, listener));
		};

		listen('loadedmetadata', () => emitDiagnostic('media_loaded_metadata'));
		listen('loadeddata', () => {
			emitDiagnostic('media_loaded_data');
			maybeConfirmPlaybackReady('media_loaded_data');
		});
		listen('canplay', () => {
			emitDiagnostic('media_can_play');
			clearBuffering();
			maybeConfirmPlaybackReady('media_can_play');
		});
		listen('play', () => {
			if (!isDocumentHidden()) startLoading();
		});
		listen('pause', () => stopLoading());
		listen('playing', () => {
			emitDiagnostic('media_playing_event');
			requestFirstVideoFrame();
			maybeConfirmPlaybackReady('media_playing_event');
		});
		listen('resize', () => {
			emitDiagnostic('media_resize');
			maybeConfirmPlaybackReady('media_resize');
		});
		listen('waiting', () => {
			emitDiagnostic('media_waiting');
			setBufferingSoon();
		});
		listen('stalled', () => {
			emitDiagnostic('media_stalled');
			setBufferingSoon();
		});
		listen('timeupdate', clearBuffering);
		listen('error', () => {
			clearBufferingTimeout();
			clearStartupTimers();
			emitDiagnostic('media_error');

			if (!hlsFallbackStarted) {
				hlsFallbackStarted = true;
				void setupHlsFallback().catch((error: Error) => {
					emitDiagnostic('hls_setup_error', { name: error.name, message: error.message });
					hasError = true;
					isPlaying = false;
					onError?.();
				});
				return;
			}

			hasError = true;
			isPlaying = false;
			onError?.();
		});

		const setupHlsFallback = async () => {
			const { default: Hls } = await import('hls.js');
			emitDiagnostic('hls_library_loaded', {
				hlsVersion: Hls.version,
				hlsSupported: Hls.isSupported()
			});
			if (!Hls.isSupported()) {
				emitDiagnostic('hls_unsupported');
				return;
			}

			const hls = new Hls({
				fragLoadingTimeOut: 20000,
				manifestLoadingTimeOut: 20000,
				levelLoadingTimeOut: 20000,
				liveSyncDurationCount: 3,
				liveMaxLatencyDurationCount: 5,
				maxLiveSyncPlaybackRate: 1.5,
				maxBufferLength: 15,
				backBufferLength: 10,
				xhrSetup(xhr) {
					xhr.withCredentials = false;
				},
				fetchSetup(context, initParams) {
					return new Request(context.url, {
						...initParams,
						mode: 'cors',
						credentials: 'omit'
					});
				}
			});
			hlsInstance = hls;
			const Events = Hls.Events;

			const onManifestParsed = (_event: string, data: { levels?: unknown[] }) => {
				emitDiagnostic('hls_manifest_parsed', {
					...readHlsState(hls),
					levelCount: data.levels?.length ?? null
				});
				void tryPlay('hls_manifest_parsed');
			};
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
			const onHlsError = (_event: string, data: any) =>
				emitDiagnostic('hls_error', {
					...readHlsState(hls),
					hlsType: data.type ?? null,
					details: data.details ?? null,
					fatal: data.fatal ?? null,
					responseCode: data.response?.code ?? null,
					url: data.context?.url ?? data.frag?.url ?? null
				});

			hls.on(Events.MANIFEST_PARSED, onManifestParsed);
			hls.on(Events.LEVEL_LOADED, onLevelLoaded);
			hls.on(Events.ERROR, onHlsError);
			hls.attachMedia(el);
			hls.loadSource(liveSrc);

			teardownHls = () => {
				hls.off(Events.MANIFEST_PARSED, onManifestParsed);
				hls.off(Events.LEVEL_LOADED, onLevelLoaded);
				hls.off(Events.ERROR, onHlsError);
				hls.destroy();
			};
		};

		const setup = async () => {
			isPlaying = false;
			hasError = false;
			el.crossOrigin = 'anonymous';
			el.muted = true;
			el.playsInline = true;
			emitDiagnostic('player_mounted', {
				src: liveSrc,
				provider: 'native',
				capabilities: collectStreamCapabilities(el)
			});
			startupSlowTimer = setTimeout(() => emitStartupCheck('startup_slow'), STARTUP_SLOW_MS);
			startupHungTimer = setTimeout(() => emitStartupCheck('startup_hung'), STARTUP_HUNG_MS);

			el.src = liveSrc;
			el.load();
			await tryPlay('native_src');
		};

		void setup().catch((error: Error) => {
			emitDiagnostic('player_setup_error', { name: error.name, message: error.message });
			hasError = true;
			onError?.();
		});

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

		return () => {
			clearInterval(stallCheck);
			teardownHls?.();
			clearBufferingTimeout();
			clearStartupTimers();
			clearFrameCallbackGrace();
			document.removeEventListener('visibilitychange', onVisibilityChange);
			if (videoFrameCallbackHandle !== undefined)
				el.cancelVideoFrameCallback?.(videoFrameCallbackHandle);
			for (const remove of eventListeners) remove();
			el.removeAttribute('src');
			el.load();
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
		<video
			bind:this={video}
			aria-label="Live river stream"
			autoplay
			muted
			playsinline
			crossorigin="anonymous"
			class="absolute inset-0 z-0 h-full w-full object-cover"
		></video>
	{/key}
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
