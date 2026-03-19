<script lang="ts">
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import VideoPlayer from '$lib/components/VideoPlayer.svelte';
	import PassDetailsPanel from '$lib/components/PassDetailsPanel.svelte';
	import TelemetryFooter from '$lib/components/TelemetryFooter.svelte';
	import LocalWeather from '$lib/components/LocalWeather.svelte';
	import defaultJpg from '$lib/assets/default.jpg';
	import { getStreamInfo } from './stream.remote';

	let phase = $state<'sales' | 'connecting' | 'connected' | 'telemetry'>('sales');
	let streamStandby = $state(true);

	let sessionActive = $derived(phase !== 'sales');
	let isConnecting = $derived(phase === 'connecting');

	const onPlaybackStart = () => {
		streamStandby = false;
	};

	const handleBeginConnection = () => {
		phase = 'connecting';
		setTimeout(() => {
			phase = 'connected';
			setTimeout(() => {
				phase = 'telemetry';
			}, 1000);
		}, 1200);
	};
</script>

<svelte:boundary>
	{#snippet pending()}
		<div class="flex h-screen items-center justify-center bg-light font-body text-primary">
			<p class="animate-pulse text-sm text-secondary">Preparing stream…</p>
		</div>
	{/snippet}
	{#snippet failed(error, reset)}
		<div
			class="flex h-screen flex-col items-center justify-center gap-4 bg-light px-6 text-center font-body"
		>
			<p class="text-sm text-secondary">
				{error instanceof Error ? error.message : 'Could not load stream configuration.'}
			</p>
			<button
				onclick={() => {
					void getStreamInfo().refresh();
					reset();
				}}
				class="cursor-pointer rounded-sm bg-primary px-6 py-3 text-xs font-medium tracking-ui text-light transition-all duration-300 hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-light focus-visible:outline-none active:scale-95"
			>
				Retry
			</button>
		</div>
	{/snippet}

	{@const stream = await getStreamInfo()}

	<div class="flex h-screen overflow-hidden bg-light font-body text-primary">
		<main class="group relative flex flex-1 flex-col justify-between p-10">
			<div class="absolute inset-0 z-0 overflow-hidden">
				<VideoPlayer
					liveSrc={stream.liveHlsUrl}
					poster={defaultJpg}
					class="relative h-full w-full"
					{sessionActive}
					onPlaying={onPlaybackStart}
				/>
				<div
					class="absolute inset-0 z-10 bg-light/30 backdrop-blur-2xl transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]"
					class:opacity-0={sessionActive}
					class:pointer-events-none={sessionActive}
				></div>
			</div>
			<div
				class="pointer-events-none absolute inset-0 z-0 bg-linear-to-b from-light/0 to-light/30 transition-opacity duration-1000"
				class:opacity-0={sessionActive}
			></div>
			<div
				class="pointer-events-none absolute inset-x-0 top-0 z-0 h-40 bg-gradient-to-b from-black/60 to-transparent opacity-0 transition-opacity duration-700 ease-out"
				class:group-hover:opacity-100={sessionActive}
			></div>

			<header
				class="relative z-10 flex w-full items-end justify-between transition-opacity duration-700 ease-out"
				class:opacity-0={sessionActive}
				class:group-hover:opacity-100={sessionActive}
			>
				<div class="text-primary transition-colors duration-700" class:text-light={sessionActive}>
					<span
						class="mb-1 block text-2xs font-medium tracking-label text-secondary uppercase transition-colors duration-700"
						class:text-light={sessionActive}
						class:opacity-70={sessionActive}
					>
						Streaming From:
					</span>
					<div class="flex items-baseline gap-4">
						<span
							class="font-display text-display tracking-display text-light drop-shadow-md transition-colors duration-700"
						>
							Trask River
						</span>
						<span
							class="text-sm font-normal text-secondary transition-colors duration-700"
							class:text-light={sessionActive}
							class:opacity-90={sessionActive}
							class:drop-shadow-md={sessionActive}
						>
							Tillamook, OR
						</span>
					</div>
				</div>
				<div
					class="flex items-center gap-2 text-2xs font-medium tracking-label text-primary uppercase transition-colors duration-700"
					class:text-light={sessionActive}
					class:drop-shadow-md={sessionActive}
				>
					<div
						class="h-1.5 w-1.5 rounded-full shadow-sm {streamStandby
							? 'bg-amber-600'
							: 'animate-pulse bg-[#BC4B31]'}"
					></div>
					{streamStandby ? 'Standby' : 'Live'}
				</div>
			</header>
		</main>

		<aside
			style="width: {phase === 'telemetry' ? '300px' : '420px'}"
			class="z-20 flex flex-col overflow-x-hidden overflow-y-auto border-l border-sepia bg-light shadow-[-10px_0_40px_rgba(0,0,0,0.04)] transition-[width] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
		>
			{#if phase === 'telemetry'}
				<div
					out:fade={{ duration: 200, easing: cubicOut }}
					in:fade={{ duration: 400, delay: 100, easing: cubicOut }}
					class="flex min-w-[300px] flex-1 flex-col"
				>
					<LocalWeather />
				</div>
			{:else}
				<div
					out:fade={{ duration: 250, easing: cubicOut }}
					in:fade={{ duration: 300, easing: cubicOut }}
					class="flex min-w-[420px] flex-1 flex-col"
				>
					<PassDetailsPanel
						{sessionActive}
						{isConnecting}
						{streamStandby}
						onBeginConnection={handleBeginConnection}
					/>
				</div>
			{/if}
			<TelemetryFooter />
		</aside>
	</div>
</svelte:boundary>
