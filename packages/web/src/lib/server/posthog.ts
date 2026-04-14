import { PostHog } from 'posthog-node';
import { PUBLIC_POSTHOG_PROJECT_TOKEN, PUBLIC_POSTHOG_HOST } from '$env/static/public';

export function createPostHogClient() {
	return new PostHog(PUBLIC_POSTHOG_PROJECT_TOKEN, {
		host: PUBLIC_POSTHOG_HOST,
		flushAt: 1,
		flushInterval: 0
	});
}
