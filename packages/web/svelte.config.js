import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({ platformProxy: { configPath: './wrangler.jsonc' } }),
		experimental: { remoteFunctions: true },
		paths: { relative: false }
	},
	compilerOptions: {
		experimental: { async: true }
	},
	vitePlugin: {
		dynamicCompileOptions: ({ filename }) =>
			filename.includes('node_modules') ? undefined : { runes: true }
	}
};

export default config;
