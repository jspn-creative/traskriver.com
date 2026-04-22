import { Hono } from 'hono';
import type { HealthSnapshot } from './supervisor.ts';

export type HealthStatus = 'starting' | 'ready' | 'degraded' | 'codec_mismatch' | 'fatal';

export interface AppOptions {
	getHealth: () => HealthSnapshot;
	opsHosts: ReadonlySet<string>;
}

export function createApp(opts: AppOptions) {
	const app = new Hono();

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

	return app;
}
