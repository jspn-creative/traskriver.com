<script lang="ts">
	let { customerCode, token, sessionActive } = $props<{
		customerCode: string;
		token: string;
		sessionActive: boolean;
	}>();

	let viewers = $state<number | '--'>('--');

	$effect(() => {
		if (!sessionActive) {
			viewers = '--';
			return;
		}

		const fetchViews = async () => {
			try {
				const res = await fetch(
					`https://customer-${customerCode}.cloudflarestream.com/${token}/views`
				);
				if (res.ok) {
					const data = (await res.json()) as { liveViewers: number };
					viewers = data.liveViewers;

					console.log('viewers', viewers);
				}
			} catch {}
		};

		fetchViews();
		const interval = setInterval(fetchViews, 10000);

		return () => clearInterval(interval);
	});
</script>

<span
	class="mb-1 flex items-center gap-1.5 text-2xs font-medium tracking-label uppercase transition-colors duration-700 {sessionActive
		? 'text-secondary'
		: 'text-light/50'}"
>
	<span class="relative flex size-1">
		<span
			class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 {sessionActive
				? 'bg-light'
				: 'bg-primary'}"
		></span>
		<span
			class="relative inline-flex size-1 rounded-full {sessionActive ? 'bg-light' : 'bg-primary'}"
		></span>
	</span>
	{sessionActive && viewers !== '--' && viewers < 1 ? 1 : viewers} viewer{viewers === 1 ||
	(sessionActive && viewers !== '--' && viewers < 1)
		? ''
		: 's'}
</span>
