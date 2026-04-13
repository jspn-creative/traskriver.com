const UPSTREAM_URL = 'https://counterscale.jspn.workers.dev/tracker';

const UPSTREAM_ORIGIN = new URL(UPSTREAM_URL).origin;

const CORS_HEADERS: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Access-Control-Max-Age': '86400'
};

function resolveUpstreamTarget(request: Request) {
	const incoming = new URL(request.url);
	const path = incoming.pathname.replace(/\/$/, '') || '/';

	if (path === '/cache') {
		return `${UPSTREAM_ORIGIN}/cache${incoming.search}`;
	}

	if (request.method === 'GET') {
		return `${UPSTREAM_ORIGIN}/collect${incoming.search}`;
	}

	return `${UPSTREAM_URL}${incoming.search}`;
}

export default {
	async fetch(request: Request) {
		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: CORS_HEADERS });
		}

		if (request.method !== 'GET' && request.method !== 'POST') {
			return new Response('Method Not Allowed', { status: 405 });
		}

		const forwardHeaders = new Headers();
		for (const [key, value] of request.headers) {
			const lower = key.toLowerCase();
			if (lower === 'host' || lower === 'connection') continue;
			if (lower.startsWith('cf-')) continue;
			forwardHeaders.append(key, value);
		}

		let upstreamBody: BodyInit | undefined;
		if (request.method === 'POST') {
			upstreamBody = await request.arrayBuffer();
		}

		const upstreamTarget = resolveUpstreamTarget(request);

		const upstreamHeaders = new Headers();
		const ct = forwardHeaders.get('Content-Type');
		if (ct) upstreamHeaders.set('Content-Type', ct);
		const accept = forwardHeaders.get('Accept');
		if (accept) upstreamHeaders.set('Accept', accept);
		if (request.method === 'GET' && !upstreamHeaders.has('Content-Type')) {
			upstreamHeaders.set('Content-Type', 'text/plain');
		}

		const upstreamResponse = await fetch(upstreamTarget, {
			method: request.method,
			headers: upstreamHeaders,
			body: upstreamBody
		});

		const outHeaders = new Headers(upstreamResponse.headers);
		for (const [key, value] of Object.entries(CORS_HEADERS)) {
			outHeaders.set(key, value);
		}

		return new Response(upstreamResponse.body, {
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText,
			headers: outHeaders
		});
	}
};
