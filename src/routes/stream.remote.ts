import { env } from '$env/dynamic/private';
import { getRequestEvent, query } from '$app/server';
import { hasActiveSubscription, createSubscriptionCookie } from '$lib/server/subscription';

export type StreamInfo = {
	liveHlsUrl: string;
	customerCode: string;
	inputId: string;
	token: string;
};

const encoder = new TextEncoder();
const toBase64Url = (value: string) =>
	btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');

const generateStreamToken = async (
	uid: string,
	keyId: string,
	jwkBase64: string
): Promise<string> => {
	const jwkJson = JSON.parse(atob(jwkBase64));
	const privateKey = await crypto.subtle.importKey(
		'jwk',
		jwkJson,
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['sign']
	);

	const header = toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: keyId }));
	const payload = toBase64Url(
		JSON.stringify({ sub: uid, kid: keyId, exp: Math.floor(Date.now() / 1000) + 3600 })
	);
	const signingInput = `${header}.${payload}`;

	const signature = await crypto.subtle.sign(
		'RSASSA-PKCS1-v1_5',
		privateKey,
		encoder.encode(signingInput)
	);
	const sigString = String.fromCharCode(...new Uint8Array(signature));

	return `${signingInput}.${toBase64Url(sigString)}`;
};

export const getStreamInfo = query(async () => {
	const event = getRequestEvent();
	console.log('[river-stream][stream.remote] getStreamInfo()', {
		path: event.url.pathname
	});
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

	const signingKeyId = env.CF_STREAM_SIGNING_KEY_ID;
	const signingJwk = env.CF_STREAM_SIGNING_JWK;

	if (!signingKeyId?.trim() || !signingJwk?.trim()) {
		throw new Error('Stream signing key is not configured');
	}

	const token = await generateStreamToken(uid, signingKeyId, signingJwk);
	console.log('[river-stream][stream.remote] token', {
		customer,
		uid,
		tokenLength: token.length,
		tokenPrefix: token.slice(0, 10)
	});
	const liveHlsUrl = `https://customer-${customer}.cloudflarestream.com/${token}/manifest/video.m3u8`;

	console.log('[river-stream][stream.remote] liveHlsUrl built');
	return { liveHlsUrl, customerCode: customer, inputId: uid, token } satisfies StreamInfo;
});
