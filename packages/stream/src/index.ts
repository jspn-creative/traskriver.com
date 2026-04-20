import { serve } from '@hono/node-server';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { createApp } from './server.ts';

const config = loadConfig();
const rootLog = createLogger({ level: config.LOG_LEVEL, nodeEnv: config.NODE_ENV });
const log = rootLog.child({ component: 'server' });

const app = createApp();

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: '0.0.0.0' }, (info) =>
	log.info({ port: info.port }, 'stream service listening')
);

function shutdown(signal: NodeJS.Signals) {
	log.info({ signal }, 'shutdown signal received');
	server.close((err) => {
		if (err) {
			log.error({ err }, 'error closing server');
			process.exit(1);
		}
		process.exit(0);
	});
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
