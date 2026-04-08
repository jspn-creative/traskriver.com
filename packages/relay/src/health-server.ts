export type HealthServer = { stop(): void };

export function startHealthServer(opts: {
	port: number;
	hostname: string;
	getSnapshot: () => Record<string, unknown>;
}): HealthServer | null {
	if (opts.port <= 0) {
		return null;
	}

	const server = Bun.serve({
		hostname: opts.hostname,
		port: opts.port,
		fetch(req) {
			const url = new URL(req.url);
			if (req.method === 'GET' && url.pathname === '/health') {
				return Response.json(opts.getSnapshot(), {
					headers: { 'Content-Type': 'application/json' }
				});
			}
			return new Response('Not Found', { status: 404 });
		}
	});

	return {
		stop() {
			server.stop();
		}
	};
}
