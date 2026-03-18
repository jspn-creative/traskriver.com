import { env } from '$env/dynamic/private';
import { hasActiveSubscription, createSubscriptionCookie } from '$lib/server/subscription';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const hasAccess = await hasActiveSubscription(cookies.get('subscription'));

	if (!hasAccess) {
		const cookieValue = await createSubscriptionCookie();
		cookies.set('subscription', cookieValue, { path: '/' });
	}

	const streamUrl = `https://customer-${env.CF_STREAM_CUSTOMER_CODE}.cloudflarestream.com/${env.CF_STREAM_LIVE_INPUT_UID}/manifest/video.m3u8`;

	return {
		streamUrl
	};
};
