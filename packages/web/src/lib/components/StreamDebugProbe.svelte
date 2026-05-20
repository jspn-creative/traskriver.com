<script lang="ts">
	import { onMount } from 'svelte';
	import {
		collectStreamCapabilities,
		readBufferedEnd,
		readHlsState,
		readMediaError,
		readVideoSnapshot,
		type NativeVideoElement
	} from '$lib/stream-diagnostics';

	type ProbeMode = 'raw-hls' | 'native-hls';
	type ProbeEvent = {
		type: string;
		elapsedMs: number;
		probeMode: ProbeMode;
		detail?: Record<string, unknown>;
	};

	let { mode, liveSrc, onDiagnostic } = $props<{
		mode: ProbeMode;
		liveSrc: string;
		onDiagnostic?: (event: ProbeEvent) => void;
	}>();

	let video = $state<NativeVideoElement>();
	let rows = $state<ProbeEvent[]>([]);
	let status = $state('initializing');
	let firstFrameSeen = $state(false);

	const push = (event: ProbeEvent) => {
		rows = [event, ...rows].slice(0, 80);
		onDiagnostic?.(event);
	};

	onMount(() => {
		const el = video;
		if (!el) return;

		let disposed = false;
		let teardownHls: (() => void) | undefined;
		let frameCallbackHandle: number | undefined;
		const startedAt = Date.now();

		const emit = (type: string, detail?: Record<string, unknown>) => {
			const event = {
				type,
				elapsedMs: Date.now() - startedAt,
				probeMode: mode,
				detail: {
					currentTime: Number.isFinite(Number(el.currentTime)) ? Number(el.currentTime) : null,
					paused: el.paused,
					readyState: el.readyState,
					networkState: el.networkState,
					bufferedEnd: readBufferedEnd(el),
					...readMediaError(el),
					...readVideoSnapshot(el),
					...detail
				}
			};
			push(event);
		};

		const requestFirstFrame = () => {
			if (firstFrameSeen || frameCallbackHandle !== undefined) return;
			if (typeof el.requestVideoFrameCallback !== 'function') {
				if (
					!el.paused &&
					el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
					el.videoWidth > 0
				) {
					firstFrameSeen = true;
					status = 'first frame fallback';
					emit('first_frame_fallback');
				}
				return;
			}

			frameCallbackHandle = el.requestVideoFrameCallback((_now, metadata) => {
				frameCallbackHandle = undefined;
				firstFrameSeen = true;
				status = 'first frame rendered';
				emit('first_frame', {
					mediaTime: metadata.mediaTime ?? null,
					presentedFrames: metadata.presentedFrames ?? null,
					width: metadata.width ?? null,
					height: metadata.height ?? null
				});
			});
		};

		const tryAutoplay = async (source: string) => {
			try {
				await el.play();
				emit('play_promise_resolved', { source });
				requestFirstFrame();
			} catch (error) {
				const err = error as Error;
				status = 'play rejected';
				emit('play_promise_rejected', {
					source,
					name: err.name ?? null,
					message: err.message ?? null
				});
			}
		};

		const eventNames = [
			'loadstart',
			'loadedmetadata',
			'loadeddata',
			'canplay',
			'playing',
			'waiting',
			'stalled',
			'pause',
			'error',
			'resize'
		] as const;
		const listeners = eventNames.map((name) => {
			const listener = () => {
				emit(`video_${name}`);
				if (
					name === 'canplay' ||
					name === 'playing' ||
					name === 'resize' ||
					name === 'loadeddata'
				) {
					requestFirstFrame();
				}
			};
			el.addEventListener(name, listener);
			return () => el.removeEventListener(name, listener);
		});

		const setup = async () => {
			emit('probe_mounted', { liveSrc, capabilities: collectStreamCapabilities(el) });
			el.crossOrigin = 'anonymous';
			el.muted = true;
			el.playsInline = true;

			if (mode === 'native-hls') {
				status = 'native video src';
				el.src = liveSrc;
				el.load();
				await tryAutoplay('native_hls_setup');
				return;
			}

			const { default: Hls } = await import('hls.js');
			emit('hls_library_loaded', {
				hlsVersion: Hls.version,
				hlsSupported: Hls.isSupported(),
				capabilities: collectStreamCapabilities(el)
			});

			if (!Hls.isSupported()) {
				status = 'hls.js unsupported, trying native src';
				emit('hls_unsupported_native_fallback');
				el.src = liveSrc;
				el.load();
				await tryAutoplay('raw_hls_native_fallback');
				return;
			}

			const hls = new Hls({
				fragLoadingTimeOut: 20000,
				manifestLoadingTimeOut: 20000,
				levelLoadingTimeOut: 20000,
				liveSyncDurationCount: 3,
				liveMaxLatencyDurationCount: 5,
				maxLiveSyncPlaybackRate: 1.5,
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
			const Events = Hls.Events;
			const onMediaAttached = () => emit('hls_media_attached', readHlsState(hls));
			const onManifestLoading = (_event: string, data: { url?: string }) =>
				emit('hls_manifest_loading', { ...readHlsState(hls), url: data.url ?? null });
			const onManifestLoaded = (_event: string, data: { url?: string; levels?: unknown[] }) =>
				emit('hls_manifest_loaded', {
					...readHlsState(hls),
					url: data.url ?? null,
					levelCount: data.levels?.length ?? null
				});
			const onManifestParsed = (
				_event: string,
				data: {
					levels?: Array<{ width?: number; height?: number; bitrate?: number; codecs?: string }>;
				}
			) => {
				status = 'manifest parsed';
				emit('hls_manifest_parsed', {
					...readHlsState(hls),
					levels:
						data.levels?.map((level) => ({
							width: level.width ?? null,
							height: level.height ?? null,
							bitrate: level.bitrate ?? null,
							codecs: level.codecs ?? null
						})) ?? []
				});
				void tryAutoplay('hls_manifest_parsed');
			};
			const onLevelLoaded = (_event: string, data: any) =>
				emit('hls_level_loaded', {
					...readHlsState(hls),
					live: data.details?.live ?? null,
					mediaSequence: data.details?.startSN ?? null,
					fragmentCount: data.details?.fragments?.length ?? null,
					targetDuration: data.details?.targetduration ?? null,
					totalDuration: data.details?.totalduration ?? null
				});
			const onFragLoaded = (_event: string, data: any) =>
				emit('hls_frag_loaded', {
					...readHlsState(hls),
					sn: data.frag?.sn ?? null,
					level: data.frag?.level ?? null,
					duration: data.frag?.duration ?? null,
					url: data.frag?.url ?? null
				});
			const onError = (_event: string, data: any) =>
				emit('hls_error', {
					...readHlsState(hls),
					hlsType: data.type ?? null,
					details: data.details ?? null,
					fatal: data.fatal ?? null,
					responseCode: data.response?.code ?? null,
					url: data.context?.url ?? data.frag?.url ?? null
				});

			hls.on(Events.MEDIA_ATTACHED, onMediaAttached);
			hls.on(Events.MANIFEST_LOADING, onManifestLoading);
			hls.on(Events.MANIFEST_LOADED, onManifestLoaded);
			hls.on(Events.MANIFEST_PARSED, onManifestParsed);
			hls.on(Events.LEVEL_LOADED, onLevelLoaded);
			hls.on(Events.FRAG_LOADED, onFragLoaded);
			hls.on(Events.ERROR, onError);
			hls.attachMedia(el);
			hls.loadSource(liveSrc);
			status = 'hls.js loading';

			teardownHls = () => {
				hls.off(Events.MEDIA_ATTACHED, onMediaAttached);
				hls.off(Events.MANIFEST_LOADING, onManifestLoading);
				hls.off(Events.MANIFEST_LOADED, onManifestLoaded);
				hls.off(Events.MANIFEST_PARSED, onManifestParsed);
				hls.off(Events.LEVEL_LOADED, onLevelLoaded);
				hls.off(Events.FRAG_LOADED, onFragLoaded);
				hls.off(Events.ERROR, onError);
				hls.destroy();
			};
		};

		void setup().catch((error: Error) => {
			if (disposed) return;
			status = 'setup failed';
			emit('probe_setup_error', { name: error.name, message: error.message });
		});

		const hungTimer = setTimeout(() => {
			if (!firstFrameSeen) {
				status = 'hung waiting for first frame';
				emit('probe_startup_hung', { capabilities: collectStreamCapabilities(el) });
			}
		}, 20_000);

		return () => {
			disposed = true;
			clearTimeout(hungTimer);
			if (frameCallbackHandle !== undefined) el.cancelVideoFrameCallback?.(frameCallbackHandle);
			for (const remove of listeners) remove();
			teardownHls?.();
			el.removeAttribute('src');
			el.load();
		};
	});
</script>

<div class="grid gap-3">
	<div class="relative aspect-video overflow-hidden rounded-md bg-black">
		<video
			bind:this={video}
			controls
			autoplay
			muted
			playsinline
			crossorigin="anonymous"
			class="h-full w-full object-cover"
		></video>
	</div>
	<div class="flex items-center justify-between gap-3 text-xs">
		<span class="font-mono text-light/70">{mode}</span>
		<span class="rounded-sm bg-white/10 px-2 py-1 font-mono text-light/80">{status}</span>
	</div>
	<div
		class="max-h-72 overflow-auto rounded-md border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-light/70"
	>
		{#each rows as row}
			<div class="border-b border-white/5 py-1 last:border-b-0">
				<span class="text-amber-200">{row.elapsedMs}ms</span>
				<span class="text-light">{row.type}</span>
				<span>{JSON.stringify(row.detail)}</span>
			</div>
		{/each}
	</div>
</div>
