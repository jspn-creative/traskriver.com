import { hasActiveSubscription, createSubscriptionCookie } from '$lib/server/subscription';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const hasAccess = await hasActiveSubscription(cookies.get('subscription'));

	if (!hasAccess) {
		const cookieValue = await createSubscriptionCookie();
		cookies.set('subscription', cookieValue, { path: '/' });
	}

	return {
		streamUrl: '/stream/index.m3u8'
	};
};
