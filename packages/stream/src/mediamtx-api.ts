export type PathInfo = {
	ready: boolean;
	bytesReceived: number;
	codec: string | null;
};

const VIDEO_CODECS = new Set([
	'AV1',
	'VP9',
	'VP8',
	'H265',
	'H264',
	'MPEG-4 Video',
	'MPEG-1/2 Video',
	'M-JPEG'
]);

export async function getPathInfo(apiPort: number, path: string, timeoutMs = 2_000) {
	const url = `http://127.0.0.1:${apiPort}/v3/paths/get/${encodeURIComponent(path)}`;
	const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
	if (!res.ok) throw new Error(`mediamtx api ${res.status}`);

	const body = (await res.json()) as {
		ready?: boolean;
		bytesReceived?: number;
		tracks?: string[];
		tracks2?: Array<{ codec: string }>;
	};

	const codecs = body.tracks2?.map((t) => t.codec) ?? body.tracks ?? [];
	const videoCodec = codecs.find((c) => VIDEO_CODECS.has(c)) ?? null;

	return {
		ready: body.ready === true,
		bytesReceived: typeof body.bytesReceived === 'number' ? body.bytesReceived : 0,
		codec: videoCodec
	} satisfies PathInfo;
}
