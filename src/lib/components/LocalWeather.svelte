<script lang="ts">
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	let weather = $state<any>(null);
	let loading = $state(true);

	$effect(() => {
		const fetchWeather = async () => {
			try {
				const res = await fetch(
					'https://api.open-meteo.com/v1/forecast?latitude=45.4562&longitude=-123.844&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FLos_Angeles'
				);
				const data = await res.json();
				weather = data.current;
			} catch (e) {
				// silently fall through to error state
			} finally {
				loading = false;
			}
		};
		void fetchWeather();
	});

	const getWeatherDescription = (code: number) => {
		if (code === 0) return 'Clear sky';
		if (code <= 3) return 'Partly cloudy';
		if (code <= 48) return 'Foggy';
		if (code <= 55) return 'Drizzle';
		if (code <= 65) return 'Rain';
		if (code <= 75) return 'Snow';
		if (code <= 82) return 'Rain showers';
		if (code >= 95) return 'Thunderstorm';
		return 'Unknown';
	};

	const getWindDir = (deg: number) => {
		const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
		return dirs[Math.round(deg / 45) % 8];
	};
</script>

<div
	in:fly={{ y: 16, duration: 700, delay: 200, easing: cubicOut }}
	class="flex flex-col px-12 py-16"
>
	<div class="mb-8">
		<h2 class="mb-2 text-2xs font-medium tracking-label text-secondary uppercase">
			Local Telemetry
		</h2>
		<p class="font-display text-2xl tracking-tight text-primary">Tillamook, OR</p>
	</div>

	{#if loading}
		<div class="flex flex-1 items-center justify-center">
			<div
				class="h-5 w-5 animate-spin rounded-full border-2 border-secondary border-t-transparent"
			></div>
		</div>
	{:else if weather}
		<div
			in:fly={{ y: 10, duration: 500, delay: 400, easing: cubicOut }}
			class="flex flex-col gap-6"
		>
			<div class="flex flex-col gap-1 border-b border-sepia pb-6">
				<span class="text-2xs font-medium tracking-label text-secondary uppercase"
					>Current Conditions</span
				>
				<div class="mt-1 flex items-baseline gap-3">
					<span class="font-display text-4xl text-primary"
						>{Math.round(weather.temperature_2m)}°</span
					>
					<span class="text-sm text-secondary">{getWeatherDescription(weather.weather_code)}</span>
				</div>
				<span class="mt-1 text-xs text-secondary"
					>Feels like {Math.round(weather.apparent_temperature)}°</span
				>
			</div>

			<div class="grid grid-cols-2 gap-x-4 gap-y-6 border-b border-sepia pb-6">
				<div class="flex flex-col gap-1.5">
					<span class="text-2xs font-medium tracking-label text-secondary uppercase">Wind</span>
					<span class="font-mono text-sm text-primary"
						>{weather.wind_speed_10m} mph {getWindDir(weather.wind_direction_10m)}</span
					>
				</div>
				<div class="flex flex-col gap-1.5">
					<span class="text-2xs font-medium tracking-label text-secondary uppercase">Humidity</span>
					<span class="font-mono text-sm text-primary">{weather.relative_humidity_2m}%</span>
				</div>
				<div class="flex flex-col gap-1.5">
					<span class="text-2xs font-medium tracking-label text-secondary uppercase"
						>Precipitation</span
					>
					<span class="font-mono text-sm text-primary">{weather.precipitation} in</span>
				</div>
			</div>

			<div class="mt-auto">
				<div class="flex items-center gap-2">
					<div
						class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-700 shadow-sm shadow-emerald-700/40"
					></div>
					<span class="text-xs font-medium text-secondary">Sensors Active</span>
				</div>
				<p class="mt-2 pl-3.5 text-2xs leading-tight text-secondary/60">
					Sensor data updated hourly from Tillamook coast stations.
				</p>
			</div>
		</div>
	{:else}
		<div class="flex flex-1 items-center justify-center">
			<p class="text-sm text-secondary">Unable to reach sensor array.</p>
		</div>
	{/if}
</div>
