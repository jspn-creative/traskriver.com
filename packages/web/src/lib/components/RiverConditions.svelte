<script lang="ts">
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	interface UsgsTimeSeries {
		variable: { variableCode: { value: string }[] };
		values: { value: { value: string; dateTime: string }[] }[];
	}

	let loading = $state(true);
	let error = $state(false);
	let flowCfs = $state<number | null>(null);
	let tempC = $state<number | null>(null);
	let latestIso = $state<string | null>(null);

	function findParam(series: UsgsTimeSeries[], code: string) {
		const ts = series.find((s) => s.variable.variableCode[0]?.value === code);
		const latest = ts?.values[0]?.value[0];
		if (!latest || latest.value === '' || latest.value === '-999999') return null;
		return { value: parseFloat(latest.value), dateTime: latest.dateTime };
	}

	function formatRelativeTime(isoDate: string) {
		const diff = Date.now() - new Date(isoDate).getTime();
		const mins = Math.floor(diff / 60_000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins} min ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		return `${Math.floor(hours / 24)}d ago`;
	}

	$effect(() => {
		const fetchGauge = async () => {
			try {
				const res = await fetch(
					'https://waterservices.usgs.gov/nwis/iv/?format=json&sites=14302480&parameterCd=00060,00010&siteStatus=active'
				);
				if (!res.ok) {
					error = true;
					return;
				}
				const json = (await res.json()) as { value?: { timeSeries?: UsgsTimeSeries[] } };
				const series = json.value?.timeSeries ?? [];
				const discharge = findParam(series, '00060');
				const temp = findParam(series, '00010');
				flowCfs = discharge?.value ?? null;
				tempC = temp?.value ?? null;
				const times = [discharge?.dateTime, temp?.dateTime].filter(Boolean) as string[];
				if (times.length) {
					latestIso = times.reduce((a, b) => (new Date(a) > new Date(b) ? a : b));
				} else {
					latestIso = null;
				}
			} catch {
				error = true;
			} finally {
				loading = false;
			}
		};
		void fetchGauge();
	});

	let relativeTime = $derived(latestIso ? formatRelativeTime(latestIso) : '');
	let gaugeOffline = $derived(!loading && !error && flowCfs === null && tempC === null);
</script>

<div
	in:fly={{ y: 16, duration: 700, delay: 200, easing: cubicOut }}
	class="flex flex-col px-5 py-8 md:px-12"
>
	<div class="mb-2">
		<h2 class="text-2xs font-medium tracking-label text-secondary uppercase">River Conditions</h2>
		<p class="font-display text-xl font-semibold tracking-tight text-primary">Trask River</p>
	</div>

	{#if loading}
		<div class="flex flex-1 items-center justify-center">
			<div
				class="h-5 w-5 animate-spin rounded-full border-2 border-secondary border-t-transparent"
			></div>
		</div>
	{:else if error}
		<div class="flex flex-1 items-center justify-center">
			<p class="text-sm text-secondary">River data unavailable.</p>
		</div>
	{:else if gaugeOffline}
		<p class="mt-4 text-sm text-secondary">
			Gauge data temporarily unavailable — check back shortly.
		</p>
	{:else}
		<div
			in:fly={{ y: 10, duration: 500, delay: 400, easing: cubicOut }}
			class="flex flex-col gap-6"
		>
			<div class="grid grid-cols-2 gap-x-4 gap-y-6 border-b border-sepia pb-6">
				<div class="flex flex-col gap-1.5">
					<span class="text-2xs font-medium tracking-label text-secondary uppercase"
						>River Flow</span
					>
					<span class="font-mono text-sm text-primary">
						{flowCfs !== null ? `${Math.round(flowCfs)} cfs` : '—'}
					</span>
				</div>
				<div class="flex flex-col gap-1.5">
					<span class="text-2xs font-medium tracking-label text-secondary uppercase"
						>Water Temp</span
					>
					<span class="font-mono text-sm text-primary">
						{tempC !== null ? `${Math.round((tempC * 9) / 5 + 32)}°F` : '—'}
					</span>
				</div>
			</div>

			<div class="mt-auto">
				<div class="flex items-center gap-2">
					<div
						class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-700 shadow-sm shadow-emerald-700/40"
					></div>
					<span class="text-xs font-medium text-secondary">USGS Gauge Data</span>
				</div>
				<p class="mt-2 pl-3.5 text-2xs leading-tight text-secondary/60">
					Updated {relativeTime}.
				</p>
			</div>
		</div>
	{/if}
</div>
