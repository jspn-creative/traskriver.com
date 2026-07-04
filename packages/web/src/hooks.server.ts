import type { HandleServerError } from '@sveltejs/kit';
import { PostHog } from 'posthog-node';
import { PUBLIC_POSTHOG_HOST, PUBLIC_POSTHOG_PROJECT_TOKEN } from '$env/static/public';

export const handleError: HandleServerError = async ({ error, status, message }) => {
	const posthog = new PostHog(PUBLIC_POSTHOG_PROJECT_TOKEN, {
		host: PUBLIC_POSTHOG_HOST,
		flushAt: 1,
		flushInterval: 0
	});

	posthog.capture({
		distinctId: 'server',
		event: 'server_error',
		properties: {
			error: error instanceof Error ? error.message : String(error),
			status,
			message
		}
	});

	await posthog.flush();

	return { message, status };
};
