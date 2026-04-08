/// <reference types="@sveltejs/kit" />

declare module '*.mp4' {
	const src: string;
	export default src;
}

declare module '*.jpg' {
	const src: string;
	export default src;
}

declare namespace App {
	interface Platform {
		env: {
			RIVER_KV: KVNamespace;
			RELAY_API_TOKEN: string;
			DEMAND_WINDOW_SECONDS?: string;
		};
	}
}
