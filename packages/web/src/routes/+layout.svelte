<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { dev } from '$app/environment';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Trask River Cam</title>
	<script
		async
		src="https://www.googletagmanager.com/gtag/js?id=G-T527K8JSHJ"
		crossorigin="anonymous"
	></script>
	<script>
		window.dataLayer = window.dataLayer || [];
		function gtag() {
			dataLayer.push(arguments);
		}
		gtag('js', new Date());
		gtag('config', 'G-T527K8JSHJ');
	</script>
</svelte:head>

{@render children()}
