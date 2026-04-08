<script lang="ts">
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import VideoPlayer from '$lib/components/VideoPlayer.svelte';
	import PassDetailsPanel from '$lib/components/PassDetailsPanel.svelte';
	import TelemetryFooter from '$lib/components/TelemetryFooter.svelte';
	import LocalWeather from '$lib/components/LocalWeather.svelte';
	import { Drawer, DrawerContent } from '$lib/components/ui/drawer';
	import defaultJpg from '$lib/assets/default.jpg';
	import { getStreamInfo } from './stream.remote';

	let phase = $state<'sales' | 'connecting' | 'connected' | 'telemetry'>('sales');
	let streamStandby = $state(true);
	let streamError = $state(false);
	let demandRegistered = $state(false);
	let demandLoading = $state(false);
	let demandError = $state<string | null>(null);
	let drawerOpen = $state(true);
	let drawerDirection = $state<'bottom' | 'right'>('bottom');

	$effect(() => {
		if (!isBrowser) return;
		const mediaQuery = window.matchMedia('(min-width: 768px)');
		const updateDirection = (e: MediaQueryListEvent | MediaQueryList) => {
			drawerDirection = e.matches ? 'right' : 'bottom';
		};
		updateDirection(mediaQuery);
		mediaQuery.addEventListener('change', updateDirection);
		return () => mediaQuery.removeEventListener('change', updateDirection);
	});

	let headerVisible = $state(true);
	let hideTimer: ReturnType<typeof setTimeout>;

	const resetHideTimer = () => {
		clearTimeout(hideTimer);
		headerVisible = true;
		hideTimer = setTimeout(() => {
			headerVisible = false;
		}, 3000);
	};

	$effect(() => {
		if (sessionActive) resetHideTimer();
		return () => clearTimeout(hideTimer);
	});

	let sessionActive = $derived(phase !== 'sales');
	let isConnecting = $derived(phase === 'connecting');

	let sidebarWidth = $derived(phase === 'telemetry' ? '300px' : '420px');

	const isBrowser = typeof window !== 'undefined';
	const log = (...args: unknown[]) => {
		if (!isBrowser) return;
		console.log('[river-stream][page]', ...args);
	};

	const onPlaybackStart = () => {
		log('onPlaybackStart');
		streamStandby = false;
		streamError = false;
	};

	const onPlaybackError = () => {
		log('onPlaybackError');
		streamError = true;
	};

	const registerDemand = async () => {
		demandLoading = true;
		demandError = null;
		try {
			const res = await fetch('/api/stream/demand', { method: 'POST' });
			if (!res.ok) {
				throw new Error('Failed to start stream');
			}
			demandRegistered = true;
			handleBeginConnection();
		} catch (e) {
			demandError = e instanceof Error ? e.message : 'Failed to start stream';
		} finally {
			demandLoading = false;
		}
	};

	const handleBeginConnection = () => {
		log('handleBeginConnection: phase=sales -> connecting');
		phase = 'connecting';
		setTimeout(() => {
			log('phase: connecting -> connected');
			phase = 'connected';
			setTimeout(() => {
				log('phase: connected -> telemetry');
				phase = 'telemetry';
			}, 1000);
		}, 1200);
	};

	$effect(() => {
		// "Whenever stuff changes" (Safari batching/debugging)
		log('state', {
			phase,
			sessionActive,
			isConnecting,
			streamStandby,
			streamError,
			demandRegistered
		});
	});
</script>

<div class="flex h-dvh flex-col overflow-hidden bg-light font-body text-primary md:flex-row">
	<main
		class="group relative flex flex-1 flex-col justify-between p-4 md:p-10"
		ontouchstart={sessionActive ? resetHideTimer : undefined}
		onmousemove={sessionActive ? resetHideTimer : undefined}
	>
		{#if demandRegistered}
			<svelte:boundary>
				{#snippet pending()}
					<div class="absolute inset-0 z-0 flex items-center justify-center">
						<p class="animate-pulse text-sm text-secondary">Starting stream…</p>
					</div>
				{/snippet}
				{#snippet failed(error, reset)}
					<div
						class="absolute inset-0 z-0 flex flex-col items-center justify-center gap-4 px-6 text-center font-body"
					>
						<p class="text-sm text-secondary">
							{error instanceof Error ? error.message : 'Could not load stream configuration.'}
						</p>
						<button
							onclick={() => {
								log('Retry clicked: getStreamInfo().refresh()');
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

				<div class="absolute inset-0 z-0 overflow-hidden">
					<VideoPlayer
						liveSrc={stream.liveHlsUrl}
						poster={defaultJpg}
						class="relative h-full w-full"
						{sessionActive}
						onPlaying={onPlaybackStart}
						onError={onPlaybackError}
					/>
					<div
						class="absolute inset-0 z-10 bg-linear-to-b from-primary/30 via-light/30 to-primary/30 backdrop-blur-2xl transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] {sessionActive
							? 'pointer-events-none opacity-0'
							: ''}"
					></div>
				</div>
			</svelte:boundary>
		{:else}
			<div class="absolute inset-0 z-0 overflow-hidden">
				<img src={defaultJpg} alt="" class="h-full w-full object-cover" />
				<div
					class="absolute inset-0 bg-linear-to-b from-primary/30 via-light/30 to-primary/30 backdrop-blur-2xl"
				></div>
			</div>
		{/if}

		<div
			class="pointer-events-none absolute inset-0 z-0 bg-linear-to-b from-light/0 to-light/30 transition-opacity duration-1000 {sessionActive
				? 'opacity-0'
				: ''}"
		></div>
		<div
			class="pointer-events-none absolute inset-x-0 top-0 z-0 h-40 bg-linear-to-b from-primary to-transparent opacity-0 transition-opacity duration-700 ease-out {sessionActive
				? headerVisible
					? 'opacity-100'
					: 'opacity-100 lg:opacity-0'
				: ''}"
		></div>

		<header
			class="relative z-10 flex w-full items-end justify-between transition-opacity duration-700 ease-out {sessionActive
				? headerVisible
					? 'opacity-100'
					: 'pointer-events-auto opacity-100 lg:pointer-events-none lg:opacity-0'
				: ''}"
		>
			<div class="transition-colors duration-700 {sessionActive ? 'text-light' : 'text-primary'}">
				<div class="flex items-baseline gap-4">
					<span
						class="font-display text-display tracking-display text-light drop-shadow-md transition-colors duration-700"
					>
						Trask River
					</span>
					<span
						class="text-sm font-medium drop-shadow-md transition-colors duration-700 {sessionActive
							? 'text-secondary'
							: 'text-light/50'}"
					>
						Tillamook, OR
					</span>
				</div>
			</div>
			<div
				class="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-2xs font-medium tracking-label uppercase backdrop-blur-md transition-colors duration-700 {sessionActive
					? 'border-primary/10 bg-primary/40 text-light drop-shadow-md'
					: 'border-secondary/10 bg-secondary/5 text-light/80'}"
			>
				<div
					class="h-1.5 w-1.5 rounded-full shadow-sm {streamError
						? 'bg-red-500'
						: streamStandby
							? 'bg-amber-500'
							: 'animate-pulse bg-green-500'}"
				></div>
				{streamError ? 'Error' : streamStandby ? 'Standby' : 'Live'}
			</div>
		</header>

		<button
			class="absolute bottom-4 left-1/2 z-20 flex min-h-[44px] min-w-[44px] -translate-x-1/2 items-center gap-2 rounded-full border border-sepia bg-light/90 px-5 py-2.5 text-xs font-medium tracking-ui text-primary shadow-md backdrop-blur-md md:hidden"
			onclick={() => (drawerOpen = true)}
		>
			<svg
				class="h-3.5 w-3.5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9 5l7 7-7 7"
					transform="rotate(-90 12 12)"
				/>
			</svg>
			{phase === 'telemetry' ? 'Conditions' : 'View Pass'}
		</button>
	</main>

	<!-- Sidebar/Drawer Container -->
	<aside
		style="width: {drawerDirection === 'right' ? sidebarWidth : '0px'}"
		class="z-20 flex flex-col overflow-x-hidden overflow-y-auto border-sepia bg-light shadow-[-10px_0_40px_rgba(0,0,0,0.04)] transition-[width] duration-900 ease-[cubic-bezier(0.16,1,0.3,1)] {drawerDirection ===
		'right'
			? 'border-l'
			: ''}"
	>
		<Drawer bind:open={drawerOpen} direction={drawerDirection} modal={drawerDirection === 'bottom'}>
			<DrawerContent
				style={drawerDirection === 'right'
					? `width: ${sidebarWidth}; min-width: ${sidebarWidth}`
					: ''}
				class="border-sepia bg-light *:overflow-auto {drawerDirection === 'right'
					? 'top-0 right-0 mt-0 h-full rounded-none transition-[width] duration-900 ease-[cubic-bezier(0.16,1,0.3,1)]'
					: 'max-h-[85vh]'}"
			>
				{#if phase === 'telemetry'}
					<div
						out:fade={{ duration: 200, easing: cubicOut }}
						in:fade={{ duration: 400, delay: 100, easing: cubicOut }}
						class="flex min-w-0 flex-1 flex-col"
					>
						<LocalWeather />
					</div>
				{:else}
					<div
						out:fade={{ duration: 250, easing: cubicOut }}
						in:fade={{ duration: 300, easing: cubicOut }}
						class="flex min-w-0 flex-1 flex-col"
					>
						<PassDetailsPanel
							{sessionActive}
							{isConnecting}
							{streamStandby}
							{demandRegistered}
							{demandLoading}
							{demandError}
							onBeginConnection={registerDemand}
						/>
					</div>
				{/if}
				<TelemetryFooter />
			</DrawerContent>
		</Drawer>
	</aside>
</div>
