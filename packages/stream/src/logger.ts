import { SeverityNumber, type AnyValue, type Logger as OtelLogger } from '@opentelemetry/api-logs';
import pino from 'pino';

const SENSITIVE_KEY_PATTERN = /(password|pass|rtsp)/i;

export function createLogger(opts: { level: string; nodeEnv: string; otelLogger?: OtelLogger }) {
	const isDev = opts.nodeEnv !== 'production';
	return pino({
		level: opts.level,
		redact: {
			paths: ['RTSP_URL', 'config.RTSP_URL', 'env.RTSP_URL', '*.password', '*.pass'],
			censor: '[REDACTED]'
		},
		transport: isDev
			? {
					target: 'pino-pretty',
					options: {
						colorize: true,
						translateTime: 'SYS:standard',
						ignore: 'pid,hostname'
					}
				}
			: undefined,
		hooks: opts.otelLogger
			? {
					logMethod(args, method, level) {
						emitOtelLog(opts.otelLogger!, this, args, level);
						return method.apply(this, args);
					}
				}
			: undefined
	});
}

function emitOtelLog(
	otelLogger: OtelLogger,
	pinoLogger: pino.Logger,
	args: unknown[],
	level: number
) {
	const [first, second] = args;
	const message = typeof second === 'string' ? second : typeof first === 'string' ? first : 'log';
	const fields = isRecord(first) ? first : {};

	otelLogger.emit({
		severityNumber: pinoLevelToSeverity(level),
		severityText: pinoLevelToText(level),
		body: message,
		attributes: {
			...normalizeRecord(pinoLogger.bindings()),
			...normalizeRecord(fields)
		}
	});
}

function pinoLevelToSeverity(level: number) {
	if (level >= 60) return SeverityNumber.FATAL;
	if (level >= 50) return SeverityNumber.ERROR;
	if (level >= 40) return SeverityNumber.WARN;
	if (level >= 30) return SeverityNumber.INFO;
	if (level >= 20) return SeverityNumber.DEBUG;
	return SeverityNumber.TRACE;
}

function pinoLevelToText(level: number) {
	if (level >= 60) return 'fatal';
	if (level >= 50) return 'error';
	if (level >= 40) return 'warn';
	if (level >= 30) return 'info';
	if (level >= 20) return 'debug';
	return 'trace';
}

function normalizeRecord(value: Record<string, unknown>) {
	return Object.fromEntries(
		Object.entries(value)
			.filter(([, entryValue]) => entryValue !== undefined)
			.map(([key, entryValue]) => [key, normalizeValue(key, entryValue)])
	);
}

function normalizeValue(key: string, value: unknown): AnyValue {
	if (SENSITIVE_KEY_PATTERN.test(key)) return '[REDACTED]';
	if (typeof value === 'string' && value.startsWith('rtsp://')) return '[REDACTED]';
	if (value instanceof Error) {
		return {
			name: value.name,
			message: value.message,
			stack: value.stack
		};
	}
	if (value instanceof Date) return value.toISOString();
	if (Array.isArray(value)) return value.map((entry) => normalizeValue(key, entry));
	if (isRecord(value)) return normalizeRecord(value);
	if (typeof value === 'bigint') return value.toString();
	if (
		value === null ||
		value === undefined ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	) {
		return value;
	}
	return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
