import { z } from 'zod';

export const ConfigSchema = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
	LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
	PORT: z.coerce.number().int().positive().default(8080),
	RTSP_URL: z.string().url(),
	MEDIAMTX_API_PORT: z.coerce.number().int().positive().default(9997),
	MEDIAMTX_HLS_PORT: z.coerce.number().int().positive().default(8888),
	HLS_DIR: z.string().default('/run/stream/hls'),
	MEDIAMTX_BIN: z.string().default('mediamtx')
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig() {
	const result = ConfigSchema.safeParse(process.env);
	if (!result.success) {
		process.stderr.write(`FATAL: invalid env:\n${z.prettifyError(result.error)}\n`);
		process.exit(1);
	}
	return result.data;
}
