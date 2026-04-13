const UPSTREAM_URL = 'https://counterscale.jspn.workers.dev/tracker';

const CORS_HEADERS: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Access-Control-Max-Age': '86400'
};

export default {
	async fetch(request: Request) {
		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: CORS_HEADERS });
		}

		if (request.method !== 'GET' && request.method !== 'POST') {
			return new Response('Method Not Allowed', { status: 405 });
		}

		const upstreamResponse = await fetch(UPSTREAM_URL, {
			method: request.method,
			headers: request.headers,
			body: request.method === 'POST' ? request.body : undefined
		});

		const response = new Response(upstreamResponse.body, {
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText,
			headers: upstreamResponse.headers
		});

		for (const [key, value] of Object.entries(CORS_HEADERS)) {
			response.headers.set(key, value);
		}

		return response;
	}
};
