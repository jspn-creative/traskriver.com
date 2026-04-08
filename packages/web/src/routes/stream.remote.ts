import { env } from '$env/dynamic/private';
import { getRequestEvent, query } from '$app/server';
import { hasActiveSubscription, createSubscriptionCookie } from '$lib/server/subscription';

export type StreamInfo = {
	liveHlsUrl: string;
};

export const getStreamInfo = query(async () => {
	const event = getRequestEvent();
	const hasAccess = await hasActiveSubscription(event.cookies.get('subscription'));

	if (!hasAccess) {
		const cookieValue = await createSubscriptionCookie();
		event.cookies.set('subscription', cookieValue, { path: '/' });
	}

	const customer = env.CF_STREAM_CUSTOMER_CODE;
	const uid = env.CF_STREAM_LIVE_INPUT_UID;

	if (!customer?.trim() || !uid?.trim()) {
		throw new Error('Stream is not configured');
	}

	const liveHlsUrl = `https://customer-${customer}.cloudflarestream.com/${uid}/manifest/video.m3u8`;

	return { liveHlsUrl } satisfies StreamInfo;
});
