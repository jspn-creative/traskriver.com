import { Hono } from 'hono';

export type HealthStatus = 'starting' | 'ready' | 'degraded' | 'codec_mismatch' | 'fatal';

export function createApp() {
	const app = new Hono();

	app.get('/health', (c) => {
		c.header('Cache-Control', 'no-store');
		return c.json({ status: 'starting' satisfies HealthStatus });
	});

	return app;
}
