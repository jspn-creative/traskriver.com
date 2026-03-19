const accountId = process.env.CF_STREAM_ACCOUNT_ID;
const apiToken = process.env.CF_STREAM_API_TOKEN;

if (!accountId) {
	console.error('Missing CF_STREAM_ACCOUNT_ID in your environment.');
	process.exit(1);
}

if (!apiToken) {
	console.error('Missing CF_STREAM_API_TOKEN in your environment.');
	process.exit(1);
}

console.log('Creating Cloudflare Stream signing key...');

const response = await fetch(
	`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/keys`,
	{
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiToken}`
		},
		body: '{}'
	}
);

const data = (await response.json()) as {
	result: { id: string; jwk: string; pem: string };
	success: boolean;
	errors: { message: string }[];
	messages: string[];
};

if (!data.success) {
	const errorMessages = data.errors?.map((e) => e.message).join(', ') ?? 'Unknown error';
	console.error(`Cloudflare API error: ${errorMessages}`);
	process.exit(1);
}

const keyId = data.result.id;
const jwk = data.result.jwk;

console.log('\nAdd to your .env:\n');
console.log(`CF_STREAM_SIGNING_KEY_ID=${keyId}`);
console.log(`CF_STREAM_SIGNING_JWK=${jwk}`);
