import { dev } from '$app/environment';
import { redirect } from '@sveltejs/kit';

import { createSubscriptionCookie } from '$lib/server/subscription';

export const POST = async ({ cookies }) => {
	console.log('Creating subscription cookie');
	cookies.set('subscription', await createSubscriptionCookie(), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: 60 * 60 * 24 * 30
	});

	throw redirect(303, '/');
};
