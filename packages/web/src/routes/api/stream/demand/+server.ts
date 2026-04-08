import { error, json } from '@sveltejs/kit';

import type { DemandResponse } from '@river-stream/shared';

const DEMAND_KEY = 'stream-demand';
const THROTTLE_MS = 30_000;

export const POST = async ({ platform }) => {
	const kv = platform?.env?.RIVER_KV;
	if (!kv) throw error(503, 'Service unavailable');

	const now = Date.now();

	const existing = await kv.get(DEMAND_KEY);
	if (existing) {
		const lastTimestamp = parseInt(existing, 10);
		if (!isNaN(lastTimestamp) && now - lastTimestamp < THROTTLE_MS) {
			return json({ ok: true });
		}
	}

	await kv.put(DEMAND_KEY, now.toString());

	return json({ ok: true });
};

export const GET = async ({ request, platform }) => {
	const kv = platform?.env?.RIVER_KV;
	const token = platform?.env?.RELAY_API_TOKEN;
	if (!kv || !token) throw error(503, 'Service unavailable');

	const authHeader = request.headers.get('authorization');
	if (!authHeader || authHeader !== `Bearer ${token}`) {
		throw error(401, 'Unauthorized');
	}

	const demandStr = await kv.get(DEMAND_KEY);
	const now = Date.now();

	const windowSeconds = parseInt(platform?.env?.DEMAND_WINDOW_SECONDS ?? '300', 10);
	const windowMs =
		(Number.isFinite(windowSeconds) && windowSeconds > 0 ? windowSeconds : 300) * 1000;

	if (!demandStr) {
		return json({
			shouldStream: false,
			demandTimestamp: null,
			ttlSeconds: 0
		} satisfies DemandResponse);
	}

	const demandTimestamp = parseInt(demandStr, 10);
	if (isNaN(demandTimestamp)) {
		return json({
			shouldStream: false,
			demandTimestamp: null,
			ttlSeconds: 0
		} satisfies DemandResponse);
	}

	const elapsed = now - demandTimestamp;
	const shouldStream = elapsed < windowMs;
	const ttlSeconds = shouldStream ? Math.ceil((windowMs - elapsed) / 1000) : 0;

	return json({
		shouldStream,
		demandTimestamp,
		ttlSeconds
	} satisfies DemandResponse);
};
