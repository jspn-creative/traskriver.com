import { env } from '$env/dynamic/private';
import Stripe from 'stripe';

let stripe: Stripe | undefined;

const requireEnv = (name: keyof typeof env) => {
	const value = env[name];

	if (!value) {
		throw new Error(`Missing ${name}.`);
	}

	return value;
};

export const isStripeConfigured = () => Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID);

export const getStripe = () => {
	stripe ??= new Stripe(requireEnv('STRIPE_SECRET_KEY'));

	return stripe;
};

export const getStripePriceId = () => requireEnv('STRIPE_PRICE_ID');

export const getStripeWebhookSecret = () => requireEnv('STRIPE_WEBHOOK_SECRET');
