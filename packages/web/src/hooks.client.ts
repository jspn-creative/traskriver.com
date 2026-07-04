import posthog from 'posthog-js';
import { PUBLIC_POSTHOG_HOST, PUBLIC_POSTHOG_PROJECT_TOKEN } from '$env/static/public';
import { dev } from '$app/environment';
import type { HandleClientError } from '@sveltejs/kit';

export async function init() {
	posthog.init(PUBLIC_POSTHOG_PROJECT_TOKEN, {
		api_host: PUBLIC_POSTHOG_HOST,
		ui_host: 'https://us.posthog.com',
		defaults: '2026-01-30',
		capture_exceptions: true,
		person_profiles: 'always',
		logs: {
			serviceName: 'traskriver-web',
			environment: dev ? 'development' : 'production',
			serviceVersion: '0.0.1',
			resourceAttributes: {
				'app.stream': 'trask'
			}
		}
	});
}

export const handleError: HandleClientError = async ({ error, status, message }) => {
	posthog.captureException(error);
	return { message, status };
};
