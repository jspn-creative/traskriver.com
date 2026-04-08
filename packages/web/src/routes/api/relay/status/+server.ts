import { error, json } from '@sveltejs/kit';

import {
	RELAY_STATUS_STALE_THRESHOLD_MS,
	RELAY_STATUS_TTL_SECONDS,
	type RelayStatusPayload,
	type RelayStatusResponse
} from '@river-stream/shared';

const RELAY_STATUS_KEY = 'relay-status';

const emptyRelayStatus = {
	state: null,
	timestamp: null,
	stale: true
} satisfies RelayStatusResponse;

const isRelayState = (state: string): state is Exclude<RelayStatusResponse['state'], null> =>
	state === 'idle' || state === 'starting' || state === 'live' || state === 'stopped';

export const GET = async ({ platform }) => {
	const kv = platform?.env?.RIVER_KV;
	if (!kv) throw error(503, 'Service unavailable');

	const raw = await kv.get(RELAY_STATUS_KEY);
	if (!raw) return json(emptyRelayStatus);

	let payload: RelayStatusPayload;
	try {
		payload = JSON.parse(raw);
	} catch {
		return json(emptyRelayStatus);
	}

	if (
		typeof payload.timestamp !== 'number' ||
		!Number.isFinite(payload.timestamp) ||
		typeof payload.state !== 'string' ||
		!isRelayState(payload.state)
	) {
		return json(emptyRelayStatus);
	}

	const stale = Date.now() - payload.timestamp > RELAY_STATUS_STALE_THRESHOLD_MS;

	return json({
		state: payload.state,
		timestamp: payload.timestamp,
		stale
	} satisfies RelayStatusResponse);
};

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
		expirationTtl: RELAY_STATUS_TTL_SECONDS
	});

	return json({ ok: true });
};
