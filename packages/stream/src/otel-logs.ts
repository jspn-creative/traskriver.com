import { logs } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { NodeSDK } from '@opentelemetry/sdk-node';

export interface OtelLogConfig {
	projectToken: string | null;
	logsEndpoint: string;
	serviceName: string;
	environment: string;
}

export function startOtelLogs(config: OtelLogConfig) {
	if (!config.projectToken) return null;

	const sdk = new NodeSDK({
		resource: resourceFromAttributes({
			'service.name': config.serviceName,
			'deployment.environment': config.environment
		}),
		logRecordProcessors: [
			new BatchLogRecordProcessor(
				new OTLPLogExporter({
					url: config.logsEndpoint,
					headers: {
						Authorization: `Bearer ${config.projectToken}`
					}
				})
			)
		]
	});

	sdk.start();
	return {
		logger: logs.getLogger(config.serviceName),
		shutdown: () => sdk.shutdown()
	};
}
