import { serve } from '@hono/node-server';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { createApp } from './server.ts';
import { Supervisor } from './supervisor.ts';

const config = loadConfig();
const rootLog = createLogger({ level: config.LOG_LEVEL, nodeEnv: config.NODE_ENV });
const log = rootLog.child({ component: 'server' });

const supervisor = new Supervisor(config, rootLog.child({ component: 'supervisor' }));

const opsHosts: ReadonlySet<string> = new Set(config.OPS_HOSTS);
const app = createApp({
	getHealth: () => supervisor.getHealthSnapshot(),
	opsHosts,
	mediamtxHlsPort: config.MEDIAMTX_HLS_PORT
});

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: '0.0.0.0' }, (info) =>
	log.info({ port: info.port }, 'stream service listening')
);

void supervisor.start().catch((err) => {
	log.error({ err }, 'supervisor failed to start');
	process.exit(1);
});

async function shutdown(signal: NodeJS.Signals) {
	log.info({ signal }, 'shutdown signal received');
	try {
		await supervisor.shutdown();
	} catch (err) {
		log.error({ err }, 'error during supervisor shutdown');
	}
	server.close((err) => {
		if (err) {
			log.error({ err }, 'error closing server');
			process.exit(1);
		}
		process.exit(0);
	});
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
