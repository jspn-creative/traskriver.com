import { join } from 'node:path';
import { z } from 'zod';

export const ConfigSchema = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
	LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
	PORT: z.coerce.number().int().positive().default(8088),
	RTSP_URL: z.string().url(),
	MEDIAMTX_API_PORT: z.coerce.number().int().positive().default(9997),
	MEDIAMTX_HLS_PORT: z.coerce.number().int().positive().default(8888),
	HLS_SEGMENT_COUNT: z.coerce.number().int().positive().default(12),
	HLS_DIR: z.string().default('/run/hls'),
	MEDIAMTX_BIN: z.string().default('mediamtx'),
	OPS_HOSTS: z
		.string()
		.default('localhost,127.0.0.1')
		.transform((s) =>
			s
				.split(',')
				.map((x) => x.trim().toLowerCase())
				.filter(Boolean)
		)
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig() {
	if (typeof process.loadEnvFile === 'function') {
		const envPaths = [join(process.cwd(), 'packages/stream/.env'), join(process.cwd(), '.env')];
		for (const p of envPaths) {
			try {
				process.loadEnvFile(p);
			} catch {
				// ignore
			}
		}
	}

	const result = ConfigSchema.safeParse(process.env);
	if (!result.success) {
		process.stderr.write(`FATAL: invalid env:\n${z.prettifyError(result.error)}\n`);
		process.exit(1);
	}
	return result.data;
}
