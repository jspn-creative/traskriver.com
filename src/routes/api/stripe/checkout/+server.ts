import { error, redirect } from '@sveltejs/kit';

import { getStripe, getStripePriceId, isStripeConfigured } from '$lib/server/stripe';

export const POST = async ({ request }) => {
	if (!isStripeConfigured()) {
		throw error(500, 'Stripe is not configured.');
	}

	const origin = new URL(request.url).origin;
	const session = await getStripe().checkout.sessions.create({
		mode: 'subscription',
		line_items: [{ price: getStripePriceId(), quantity: 1 }],
		success_url: `${origin}/api/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${origin}/`,
		allow_promotion_codes: true
	});

	if (!session.url) {
		throw error(500, 'Stripe did not return a checkout URL.');
	}

	throw redirect(303, session.url);
};
