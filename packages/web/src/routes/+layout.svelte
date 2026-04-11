<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import * as Counterscale from '@counterscale/tracker';

	let { children } = $props();

	$effect(() => {
		if (typeof window === 'undefined') return;

		const hostname = window.location.hostname;
		const isProduction = hostname === 'traskriver.com' || hostname === 'www.traskriver.com';

		if (!isProduction) return;

		Counterscale.init({
			siteId: 'traskriver.com',
			reporterUrl: 'https://counterscale.jspn.workers.dev/tracker'
		});

		return () => {
			Counterscale.cleanup();
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Trask River Cam</title>
</svelte:head>

{@render children()}
