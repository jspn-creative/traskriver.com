import pino from 'pino';

export function createLogger(opts: { level: string; nodeEnv: string }) {
	const isDev = opts.nodeEnv !== 'production';
	return pino({
		level: opts.level,
		transport: isDev
			? {
					target: 'pino-pretty',
					options: {
						colorize: true,
						translateTime: 'SYS:standard',
						ignore: 'pid,hostname'
					}
				}
			: undefined
	});
}
