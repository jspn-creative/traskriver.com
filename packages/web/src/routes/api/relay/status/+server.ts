import { error, json } from '@sveltejs/kit';

import type { RelayStatusPayload } from '@river-stream/shared';

const RELAY_STATUS_KEY = 'relay-status';
const STATUS_TTL_SECONDS = 120;

export const POST = async ({ request, platform }) => {
	const kv = platform?.env?.RIVER_KV;
	const token = platform?.env?.RELAY_API_TOKEN;
	if (!kv || !token) throw error(503, 'Service unavailable');

	const authHeader = request.headers.get('authorization');
	if (!authHeader || authHeader !== `Bearer ${token}`) {
		throw error(401, 'Unauthorized');
	}

	let payload: RelayStatusPayload;
	try {
		payload = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	if (typeof payload.state !== 'string' || !payload.state) {
		throw error(400, 'Missing state');
	}
	if (typeof payload.timestamp !== 'number' || !Number.isFinite(payload.timestamp)) {
		throw error(400, 'Missing timestamp');
	}

	await kv.put(RELAY_STATUS_KEY, JSON.stringify(payload), {
		expirationTtl: STATUS_TTL_SECONDS
	});

	return json({ ok: true });
};
