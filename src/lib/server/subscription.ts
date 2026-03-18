import { env } from '$env/dynamic/private';

const encoder = new TextEncoder();
const thirtyDaysInSeconds = 60 * 60 * 24 * 30;

const getCookieSecret = () => env.COOKIE_SECRET ?? 'river-stream-local-dev-secret';

const toBase64Url = (value: string) =>
	btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');

const fromBase64Url = (value: string) => {
	const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

	return atob(padded);
};

const toUint8Array = (value: string) => Uint8Array.from(value, (char) => char.charCodeAt(0));

const getSigningKey = async () =>
	crypto.subtle.importKey(
		'raw',
		encoder.encode(getCookieSecret()),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);

const signValue = async (value: string) => {
	const key = await getSigningKey();
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
	const signatureString = String.fromCharCode(...new Uint8Array(signature));

	return toBase64Url(signatureString);
};

export const createSubscriptionCookie = async () => {
	const payload = toBase64Url(
		JSON.stringify({
			active: true,
			expiresAt: Date.now() + thirtyDaysInSeconds * 1000
		})
	);

	return `${payload}.${await signValue(payload)}`;
};

export const hasActiveSubscription = async (value: string | undefined) => {
	if (!value) {
		return false;
	}

	const [payload, signature] = value.split('.');

	if (!payload || !signature) {
		return false;
	}

	const key = await getSigningKey();
	const isValid = await crypto.subtle.verify(
		'HMAC',
		key,
		toUint8Array(fromBase64Url(signature)),
		encoder.encode(payload)
	);

	if (!isValid) {
		return false;
	}

	const parsed = JSON.parse(fromBase64Url(payload)) as { active?: boolean; expiresAt?: number };

	return (
		parsed.active === true && typeof parsed.expiresAt === 'number' && parsed.expiresAt > Date.now()
	);
};
