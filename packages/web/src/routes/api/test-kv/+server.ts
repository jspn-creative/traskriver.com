import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';

export const GET = async ({ platform }) => {
	if (!dev) throw error(404, 'Not found');

	const kv = platform?.env?.RIVER_KV;
	if (!kv) throw error(503, 'KV binding not available — check platformProxy config');

	const { keys } = await kv.list();

	const entries = await Promise.all(
		keys.map(async ({ name, expiration }) => ({
			key: name,
			value: await kv.get(name),
			expiration: expiration ? new Date(expiration * 1000).toISOString() : null
		}))
	);

	return json({ binding: 'RIVER_KV', count: keys.length, entries });
};
