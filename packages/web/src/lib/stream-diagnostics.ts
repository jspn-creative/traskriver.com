export type StreamDiagnostic = {
	type: string;
	elapsedMs: number;
	playerKey: number;
	currentTime: number | null;
	paused: boolean | null;
	readyState: number | null;
	networkState: number | null;
	bufferedEnd: number | null;
	errorCode: number | null;
	errorMessage: string | null;
	videoCurrentTime: number | null;
	videoPaused: boolean | null;
	videoReadyState: number | null;
	videoNetworkState: number | null;
	videoWidth: number | null;
	videoHeight: number | null;
	videoDecodedFrameCount: number | null;
	videoDroppedFrameCount: number | null;
	detail?: Record<string, unknown>;
};

export type NativeVideoElement = HTMLVideoElement & {
	webkitDecodedFrameCount?: number;
	webkitDroppedFrameCount?: number;
	requestVideoFrameCallback?: (
		callback: (
			now: number,
			metadata: {
				mediaTime?: number;
				presentedFrames?: number;
				width?: number;
				height?: number;
			}
		) => void
	) => number;
	cancelVideoFrameCallback?: (handle: number) => void;
};

export const HLS_MIME_TYPE = 'application/vnd.apple.mpegurl';
export const HLS_CODEC_MIME_TYPE = 'video/mp4; codecs="avc1.640032, mp4a.40.2"';
export const HLS_VIDEO_CODEC_MIME_TYPE = 'video/mp4; codecs="avc1.640032"';

export const readBufferedEnd = (el: HTMLMediaElement | null | undefined) => {
	try {
		const buffered = el?.buffered;
		if (!buffered?.length) return null;
		return Number(buffered.end(buffered.length - 1)) || null;
	} catch {
		return null;
	}
};

export const readMediaError = (el: HTMLMediaElement | null | undefined) => {
	const error = el?.error;
	return {
		errorCode: typeof error?.code === 'number' ? error.code : null,
		errorMessage: typeof error?.message === 'string' ? error.message : null
	};
};

export const readVideoSnapshot = (video: NativeVideoElement | null | undefined) => ({
	videoCurrentTime: Number.isFinite(Number(video?.currentTime)) ? Number(video?.currentTime) : null,
	videoPaused: typeof video?.paused === 'boolean' ? video.paused : null,
	videoReadyState: typeof video?.readyState === 'number' ? video.readyState : null,
	videoNetworkState: typeof video?.networkState === 'number' ? video.networkState : null,
	videoWidth: typeof video?.videoWidth === 'number' ? video.videoWidth : null,
	videoHeight: typeof video?.videoHeight === 'number' ? video.videoHeight : null,
	videoDecodedFrameCount:
		typeof video?.webkitDecodedFrameCount === 'number' ? video.webkitDecodedFrameCount : null,
	videoDroppedFrameCount:
		typeof video?.webkitDroppedFrameCount === 'number' ? video.webkitDroppedFrameCount : null
});

export const collectStreamCapabilities = (video?: HTMLVideoElement | null) => {
	const mediaSource = typeof MediaSource === 'undefined' ? null : MediaSource;
	const canPlay = (type: string) => {
		try {
			return video?.canPlayType(type) || '';
		} catch {
			return 'threw';
		}
	};

	return {
		is_secure_context: typeof window === 'undefined' ? null : window.isSecureContext,
		media_source_available: !!mediaSource,
		media_source_hls_codec_supported: mediaSource?.isTypeSupported(HLS_CODEC_MIME_TYPE) ?? null,
		media_source_video_codec_supported:
			mediaSource?.isTypeSupported(HLS_VIDEO_CODEC_MIME_TYPE) ?? null,
		video_frame_callback_supported: !!video?.requestVideoFrameCallback,
		native_hls_can_play: canPlay(HLS_MIME_TYPE),
		legacy_native_hls_can_play: canPlay('application/x-mpegURL'),
		mp4_codec_can_play: canPlay(HLS_CODEC_MIME_TYPE)
	};
};

export const readHlsState = (hls: unknown) => {
	if (!hls || typeof hls !== 'object') {
		return {
			hls_version: null,
			hls_current_level: null,
			hls_load_level: null,
			hls_next_level: null,
			hls_auto_level_enabled: null,
			hls_level_count: null,
			hls_media_buffered_end: null
		};
	}

	const instance = hls as {
		version?: string;
		currentLevel?: number;
		loadLevel?: number;
		nextLevel?: number;
		autoLevelEnabled?: boolean;
		levels?: unknown[];
		media?: HTMLMediaElement | null;
	};

	return {
		hls_version: instance.version ?? null,
		hls_current_level: typeof instance.currentLevel === 'number' ? instance.currentLevel : null,
		hls_load_level: typeof instance.loadLevel === 'number' ? instance.loadLevel : null,
		hls_next_level: typeof instance.nextLevel === 'number' ? instance.nextLevel : null,
		hls_auto_level_enabled:
			typeof instance.autoLevelEnabled === 'boolean' ? instance.autoLevelEnabled : null,
		hls_level_count: Array.isArray(instance.levels) ? instance.levels.length : null,
		hls_media_buffered_end: readBufferedEnd(instance.media)
	};
};
