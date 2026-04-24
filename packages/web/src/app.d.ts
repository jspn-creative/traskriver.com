/// <reference types="@sveltejs/kit" />

declare module '*.mp4' {
	const src: string;
	export default src;
}

declare module '*.jpg' {
	const src: string;
	export default src;
}

declare module '$env/static/public' {
	export const PUBLIC_STREAM_HLS_URL: string;
}

declare namespace App {
	// Platform env bindings removed — no KV or relay secrets needed.
}
