import { error, json } from '@sveltejs/kit';

import { getStripe, getStripeWebhookSecret } from '$lib/server/stripe';

export const POST = async ({ request }) => {
	const signature = request.headers.get('stripe-signature');

	if (!signature) {
		throw error(400, 'Missing Stripe signature.');
	}

	const payload = await request.text();

	try {
		const event = getStripe().webhooks.constructEvent(payload, signature, getStripeWebhookSecret());

		if (event.type === 'checkout.session.completed') {
			console.log('Stripe checkout completed:', event.data.object.id);
		} else {
			console.log('Unhandled Stripe event:', event.type);
		}
	} catch (issue) {
		const message = issue instanceof Error ? issue.message : 'Invalid Stripe webhook.';
		throw error(400, message);
	}

	return json({ received: true });
};
