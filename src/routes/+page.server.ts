import { hasActiveSubscription } from '$lib/server/subscription';

export const load = async ({ cookies }) => {
	const hasAccess = await hasActiveSubscription(cookies.get('subscription'));

	return {
		streamUrl: hasAccess ? '/stream/index.m3u8' : null
	};
};
