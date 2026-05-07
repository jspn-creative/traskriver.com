<script lang="ts">
	import VideoPlayer from '$lib/components/VideoPlayer.svelte';
	import LocalWeather from '$lib/components/LocalWeather.svelte';
	import RiverConditions from '$lib/components/RiverConditions.svelte';
	import FishRunStatus from '$lib/components/FishRunStatus.svelte';
	import { Drawer, DrawerContent } from '$lib/components/ui/drawer';
	import defaultJpg from '$lib/assets/default.jpg';
	import * as env from '$env/static/public';
	import posthog from 'posthog-js';

	const __DEV__ = import.meta.env.DEV;

	let phase = $state<'connecting' | 'viewing' | 'degraded' | 'error'>('connecting');
	let streamBuffering = $state(false);
	let playerKey = $state(0);
	let drawerOpen = $state(false);
	let drawerDirection = $state<'bottom' | 'right'>('bottom');
	let headerVisible = $state(true);
	let hideTimer: ReturnType<typeof setTimeout>;
	let bufferingEventSent = $state(false);
	const pageLoadTime = Date.now();

	const log = (msg: string, data?: Record<string, unknown>) =>
		console.log(`[stream] ${msg}`, data ?? '');

	const sessionActive = $derived(phase === 'viewing' || phase === 'degraded');
	const sidebarWidth = $derived(phase === 'viewing' ? '300px' : '420px');

	const resetHideTimer = () => {
		clearTimeout(hideTimer);
		headerVisible = true;
		hideTimer = setTimeout(() => {
			headerVisible = false;
		}, 3000);
	};

	$effect(() => {
		if (typeof window === 'undefined') return;
		const mediaQuery = window.matchMedia('(min-width: 768px)');
		let initialized = false;
		const updateDirection = (e: MediaQueryListEvent | MediaQueryList) => {
			drawerDirection = e.matches ? 'right' : 'bottom';
			if (!initialized) {
				drawerOpen = e.matches;
				initialized = true;
			}
		};
		updateDirection(mediaQuery);
		mediaQuery.addEventListener('change', updateDirection);
		return () => mediaQuery.removeEventListener('change', updateDirection);
	});

	$effect(() => {
		if (sessionActive) resetHideTimer();
		return () => clearTimeout(hideTimer);
	});

	const onPlaybackStart = () => {
		log('playback started — entering viewing phase');
		phase = 'viewing';
		streamBuffering = false;
		const ttff = Date.now() - pageLoadTime;
		posthog.capture('stream_viewed');
		posthog.capture('time_to_first_frame', { ms: ttff });
	};

	const onPlaybackBuffering = (buffering: boolean) => {
		streamBuffering = buffering;
		if (buffering) {
			log('playback buffering');
			if (bufferingEventSent) return;
			posthog.capture('playback_buffering_started');
			bufferingEventSent = true;
			return;
		}
		bufferingEventSent = false;
	};

	const onPlaybackError = () => {
		const fromPhase = phase;
		log('playback error — entering error phase');
		phase = 'error';
		posthog.capture('stream_error', { from_phase: fromPhase });
	};

	const onDegraded = () => {
		if (phase === 'degraded') return;
		log('stream degraded — camera may be offline');
		phase = 'degraded';
		posthog.capture('stream_degraded');
	};

	const onRecovered = () => {
		if (phase !== 'degraded') return;
		log('stream recovered');
		phase = 'viewing';
		posthog.capture('stream_recovered');
	};

	const retryPlayer = () => {
		log('user retry — remounting player');
		playerKey += 1;
		streamBuffering = false;
		phase = 'connecting';
	};

	const statusLabel = $derived(
		phase === 'error'
			? 'Error'
			: phase === 'degraded'
				? 'Offline'
				: phase === 'viewing' && streamBuffering
					? 'Buffering'
					: phase === 'viewing'
						? 'Live'
						: 'Connecting'
	);
	const statusDotClass = $derived(
		phase === 'error'
			? 'bg-red-500'
			: phase === 'viewing' && !streamBuffering
				? 'animate-pulse bg-green-500'
				: 'animate-pulse bg-amber-500'
	);

	$effect(() => {
		if (__DEV__) console.debug('[page]', { phase, streamBuffering });
	});
</script>

<div class="flex h-dvh flex-col overflow-hidden bg-light font-body text-primary md:flex-row">
	<main
		class="group relative flex flex-1 flex-col justify-between p-4 md:p-10"
		ontouchstart={sessionActive ? resetHideTimer : undefined}
		onmousemove={sessionActive ? resetHideTimer : undefined}
	>
		<div class="absolute inset-0 z-0 overflow-hidden">
			{#key playerKey}
				<VideoPlayer
					liveSrc={env.PUBLIC_STREAM_HLS_URL}
					poster={defaultJpg}
					class="relative h-full w-full"
					onPlaying={onPlaybackStart}
					onError={onPlaybackError}
					onBuffering={onPlaybackBuffering}
					{onDegraded}
					{onRecovered}
				/>
			{/key}
			<div
				class="pointer-events-none absolute inset-0 z-10 bg-linear-to-b from-primary/30 via-light/30 to-primary/30 backdrop-blur-2xl transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] {sessionActive
					? 'opacity-0'
					: ''}"
			></div>
		</div>

		{#if phase === 'connecting'}
			<div
				class="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center"
			>
				<svg
					class="mb-3 h-6 w-6 animate-spin text-white/70"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
				>
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
					></circle>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
				<p class="animate-pulse text-sm text-light drop-shadow-md">Connecting...</p>
			</div>
		{:else if phase === 'degraded'}
			<div
				class="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm"
			>
				<svg
					class="mb-3 h-6 w-6 animate-spin text-white/70"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
				>
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
					></circle>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
				<p class="text-sm text-white drop-shadow-md">Camera offline — retrying…</p>
			</div>
		{:else if phase === 'error'}
			<div class="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4">
				<p class="text-sm text-white/70 drop-shadow-md">Stream unavailable</p>
				<button
					onclick={retryPlayer}
					class="cursor-pointer rounded-sm bg-light/90 px-6 py-3 text-xs font-medium tracking-ui text-primary backdrop-blur-md transition-all duration-300 hover:bg-light active:scale-95"
				>
					Try again
				</button>
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
			class="relative z-40 flex w-full flex-wrap items-end justify-between transition-opacity duration-700 ease-out {sessionActive
				? headerVisible
					? 'opacity-100'
					: 'pointer-events-auto opacity-100 lg:pointer-events-none lg:opacity-0'
				: ''}"
		>
			<div class="transition-colors duration-700 {sessionActive ? 'text-light' : 'text-primary'}">
				<div class="flex items-baseline gap-4">
					<span
						class="min-w-fit font-display text-display tracking-display text-light transition-colors duration-700 text-shadow-lg"
					>
						Trask River
					</span>
					<span
						class="min-w-fit text-sm font-medium transition-colors duration-700 {sessionActive
							? 'text-secondary [text-shadow:0_0_20px_black,0_0_10px_black,0_0_4px_black]'
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
				<div class="h-1.5 w-1.5 rounded-full shadow-sm {statusDotClass}"></div>
				{statusLabel}
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
			{phase === 'viewing' ? 'Conditions' : 'Stream Info'}
		</button>
	</main>

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
				<div class="flex min-w-0 flex-1 flex-col">
					<div class="px-5 pt-8 pb-6 md:px-12 md:pt-16 md:pb-8">
						<h2 class="font-display text-3xl font-semibold tracking-tight text-primary">
							Trask River Cam
						</h2>
						<p class="mt-3 text-sm leading-relaxed text-secondary">
							Get a live look at the Trask River — known for its winter Steelhead and fall Chinook
							salmon runs on Oregon's north coast.
						</p>
					</div>
					<LocalWeather />
					<RiverConditions />
					<FishRunStatus />
				</div>
			</DrawerContent>
		</Drawer>
	</aside>
</div>
