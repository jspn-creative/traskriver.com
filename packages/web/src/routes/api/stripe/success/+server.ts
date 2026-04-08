import { dev } from '$app/environment';
import { error, redirect } from '@sveltejs/kit';

import { createSubscriptionCookie } from '$lib/server/subscription';
import { getStripe, isStripeConfigured } from '$lib/server/stripe';

export const GET = async ({ cookies, url }) => {
	if (!isStripeConfigured()) {
		throw error(500, 'Stripe is not configured.');
	}

	const sessionId = url.searchParams.get('session_id');

	if (!sessionId) {
		throw error(400, 'Missing Stripe session ID.');
	}

	const session = await getStripe().checkout.sessions.retrieve(sessionId, {
		expand: ['subscription']
	});

	const subscription =
		session.subscription && typeof session.subscription !== 'string' ? session.subscription : null;

	const isActive =
		session.status === 'complete' &&
		subscription &&
		['active', 'trialing'].includes(subscription.status);

	if (!isActive) {
		throw error(400, 'Subscription is not active.');
	}

	cookies.set('subscription', await createSubscriptionCookie(), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: 60 * 60 * 24 * 30
	});

	throw redirect(303, '/');
};
