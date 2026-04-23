import { Hono } from 'hono';
import type { HealthSnapshot } from './supervisor.ts';

export type HealthStatus = 'starting' | 'ready' | 'degraded' | 'codec_mismatch' | 'fatal';

export interface AppOptions {
	getHealth: () => HealthSnapshot;
	opsHosts: ReadonlySet<string>;
	mediamtxHlsPort: number;
}

export function createApp(opts: AppOptions) {
	const app = new Hono();
	const hopByHopHeaders = new Set([
		'connection',
		'keep-alive',
		'proxy-authenticate',
		'proxy-authorization',
		'te',
		'trailer',
		'transfer-encoding',
		'upgrade'
	]);

	app.use('/health', async (c, next) => {
		const raw = c.req.header('host') ?? '';
		const hostOnly = raw.split(':')[0]!.toLowerCase();
		if (!hostOnly || !opts.opsHosts.has(hostOnly)) {
			return c.notFound();
		}
		await next();
	});

	app.get('/health', (c) => {
		c.header('Cache-Control', 'no-store');
		return c.json(opts.getHealth());
	});

	app.all('/trask/*', async (c) => {
		const incomingUrl = new URL(c.req.url);
		const upstreamUrl = new URL(
			`${incomingUrl.pathname}${incomingUrl.search}`,
			`http://127.0.0.1:${opts.mediamtxHlsPort}`
		);
		const requestHeaders = new Headers(c.req.raw.headers);
		requestHeaders.set('host', `127.0.0.1:${opts.mediamtxHlsPort}`);
		requestHeaders.set('x-forwarded-host', c.req.header('host') ?? incomingUrl.host);
		requestHeaders.set(
			'x-forwarded-proto',
			c.req.header('x-forwarded-proto') ?? incomingUrl.protocol.replace(':', '')
		);
		requestHeaders.set(
			'x-forwarded-port',
			c.req.header('x-forwarded-port') ?? (incomingUrl.protocol === 'https:' ? '443' : '80')
		);

		for (const headerName of hopByHopHeaders) {
			requestHeaders.delete(headerName);
		}

		const method = c.req.method;
		const requestBody =
			method === 'GET' || method === 'HEAD' ? undefined : await c.req.arrayBuffer();

		try {
			const upstreamResponse = await fetch(upstreamUrl, {
				method,
				headers: requestHeaders,
				body: requestBody,
				redirect: 'manual'
			});
			const responseHeaders = new Headers(upstreamResponse.headers);
			for (const headerName of hopByHopHeaders) {
				responseHeaders.delete(headerName);
			}
			return new Response(upstreamResponse.body, {
				status: upstreamResponse.status,
				headers: responseHeaders
			});
		} catch {
			return c.text('Upstream unavailable', 502);
		}
	});

	return app;
}
