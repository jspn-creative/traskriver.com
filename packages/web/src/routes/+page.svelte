<script lang="ts">
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import type { RelayStatusResponse } from '@river-stream/shared';
	import VideoPlayer from '$lib/components/VideoPlayer.svelte';
	import PassDetailsPanel from '$lib/components/PassDetailsPanel.svelte';
	import TelemetryFooter from '$lib/components/TelemetryFooter.svelte';
	import LocalWeather from '$lib/components/LocalWeather.svelte';
	import { Drawer, DrawerContent } from '$lib/components/ui/drawer';
	import defaultJpg from '$lib/assets/default.jpg';
	import { getStreamInfo } from './stream.remote';

	let phase = $state<
		'idle' | 'starting' | 'live' | 'viewing' | 'ended' | 'ended_confirming' | 'unavailable' | 'error'
	>('idle');
	let streamStandby = $state(true);
	let streamError = $state(false);
	let demandRegistered = $state(false);
	let demandLoading = $state(false);
	let demandError = $state<string | null>(null);
	let polling = $state(false);
	let startingTimestamp = $state<number | null>(null);
	let startingUnavailableAccumulatedMs = $state(0);
	let startingUnavailableSince = $state<number | null>(null);
	let relayStale = $state(false);
	let lastKnownRelayState = $state<RelayStatusResponse['state']>(null);
	let relayPrefetched = $state(false);
	let drawerOpen = $state(true);
	let drawerDirection = $state<'bottom' | 'right'>('bottom');
	const POLL_INTERVAL_MS = 3_000;
	const STARTING_TIMEOUT_MS = 60_000;
	const isBrowser = typeof window !== 'undefined';

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

	let sessionActive = $derived(phase !== 'idle' && phase !== 'ended' && phase !== 'error');
	let sidebarWidth = $derived(phase === 'viewing' ? '300px' : '420px');
	const log = (...args: unknown[]) => {
		if (!isBrowser) return;
		console.log('[river-stream][page]', ...args);
	};

	const prefetchRelayStatus = async () => {
		try {
			const res = await fetch('/api/relay/status');
			if (!res.ok) return;
			const data: RelayStatusResponse = await res.json();
			relayStale = data.stale;
			lastKnownRelayState = data.state;
		} catch {
			log('relay status prefetch failed');
		}
	};

	const pollRelayStatus = async () => {
		try {
			const res = await fetch('/api/relay/status');
			if (!res.ok) return;
			const data: RelayStatusResponse = await res.json();

			const previousKnownRelayState = lastKnownRelayState;
			relayStale = data.stale;
			if (data.state !== null) lastKnownRelayState = data.state;

			// Timeout counts only while relay is responsive; unavailable windows are excluded.
			if (phase === 'starting' && startingTimestamp) {
				const elapsed = Date.now() - startingTimestamp - startingUnavailableAccumulatedMs;
				if (elapsed > STARTING_TIMEOUT_MS) {
					phase = 'error';
					polling = false;
					return;
				}
			}

			if (data.stale) {
				if (
					(previousKnownRelayState === 'stopped' || data.state === 'stopped') &&
					(phase === 'starting' || phase === 'ended_confirming')
				) {
					phase = 'ended';
					polling = false;
					return;
				}

				if (phase === 'starting' || phase === 'unavailable') {
					phase = 'unavailable';
					if (!startingUnavailableSince) startingUnavailableSince = Date.now();
				}
				return;
			}

			if (startingUnavailableSince) {
				startingUnavailableAccumulatedMs += Date.now() - startingUnavailableSince;
				startingUnavailableSince = null;
			}

			if (phase === 'starting' || phase === 'unavailable') {
				if (data.state === 'live') {
					phase = 'live';
					streamError = false;
				} else if (data.state === 'idle' || data.state === 'starting') {
					if (phase === 'unavailable') phase = 'starting';
				} else if (data.state === 'stopped') {
					// Relay "stopped" maps to user-facing "ended".
					phase = 'ended';
					polling = false;
				}
			} else if (phase === 'ended_confirming') {
				if (data.state === 'idle' || data.state === 'stopped') {
					phase = 'ended';
					polling = false;
				} else if (data.state === 'live') {
					phase = 'live';
					streamError = false;
				}
			}
		} catch {
			log('relay status poll failed');
		}
	};

	$effect(() => {
		if (relayPrefetched) return;
		relayPrefetched = true;
		void prefetchRelayStatus();
	});

	$effect(() => {
		if (!polling) return;
		let cancelled = false;

		const tick = async () => {
			if (cancelled) return;
			await pollRelayStatus();
			if (cancelled || !polling) return;
			setTimeout(() => {
				void tick();
			}, POLL_INTERVAL_MS);
		};

		void tick();
		return () => {
			cancelled = true;
		};
	});

	const onPlaybackStart = () => {
		log('onPlaybackStart');
		phase = 'viewing';
		polling = false;
		streamStandby = false;
		streamError = false;
	};

	const onPlaybackError = () => {
		log('onPlaybackError — resuming relay polling for end confirmation');
		streamError = true;
		if (phase === 'viewing' || phase === 'live') {
			phase = 'ended_confirming';
			polling = true;
		}
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
			phase = 'starting';
			streamStandby = true;
			streamError = false;
			startingTimestamp = Date.now();
			startingUnavailableAccumulatedMs = 0;
			startingUnavailableSince = null;
			polling = true;
		} catch (e) {
			demandError = e instanceof Error ? e.message : 'Failed to start stream';
		} finally {
			demandLoading = false;
		}
	};

	const restartStream = () => {
		log('restartStream — full reset');
		phase = 'idle';
		demandRegistered = false;
		streamStandby = true;
		streamError = false;
		startingTimestamp = null;
		startingUnavailableAccumulatedMs = 0;
		startingUnavailableSince = null;
		polling = false;
		relayStale = false;
		void registerDemand();
	};

	$effect(() => {
		log('state', {
			phase,
			sessionActive,
			streamStandby,
			streamError,
			demandRegistered,
			relayStale,
			lastKnownRelayState
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

		{#if phase === 'starting'}
			<div class="absolute inset-0 z-30 flex items-center justify-center">
				<p class="animate-pulse text-sm text-light drop-shadow-md">Starting stream...</p>
			</div>
		{:else if phase === 'unavailable'}
			<div class="absolute inset-0 z-30 flex items-center justify-center">
				<p class="text-sm text-light/70 drop-shadow-md">Stream unavailable</p>
			</div>
		{:else if phase === 'ended'}
			<div class="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4">
				<p class="text-sm text-light drop-shadow-md">Stream ended</p>
				<button
					onclick={restartStream}
					class="cursor-pointer rounded-sm bg-light/90 px-6 py-3 text-xs font-medium tracking-ui text-primary backdrop-blur-md transition-all duration-300 hover:bg-light active:scale-95"
				>
					Watch again
				</button>
			</div>
		{:else if phase === 'error'}
			<div class="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4">
				<p class="text-sm text-light/70 drop-shadow-md">Stream took too long to start</p>
				<button
					onclick={restartStream}
					class="cursor-pointer rounded-sm bg-light/90 px-6 py-3 text-xs font-medium tracking-ui text-primary backdrop-blur-md transition-all duration-300 hover:bg-light active:scale-95"
				>
					Try again
				</button>
			</div>
		{:else if phase === 'ended_confirming'}
			<div class="absolute inset-0 z-30 flex items-center justify-center">
				<p class="animate-pulse text-sm text-light drop-shadow-md">Checking stream status...</p>
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
			class="relative z-40 flex w-full items-end justify-between transition-opacity duration-700 ease-out {sessionActive
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
					class="h-1.5 w-1.5 rounded-full shadow-sm {streamError || phase === 'error'
						? 'bg-red-500'
						: phase === 'viewing'
							? 'animate-pulse bg-green-500'
							: phase === 'unavailable'
								? 'bg-secondary/50'
								: phase === 'starting' || phase === 'live'
									? 'animate-pulse bg-amber-500'
									: phase === 'ended' || phase === 'ended_confirming'
										? 'bg-secondary'
										: 'bg-amber-500'}"
				></div>
				{streamError || phase === 'error'
					? 'Error'
					: phase === 'viewing'
						? 'Live'
						: phase === 'unavailable'
							? 'Offline'
							: phase === 'starting' || phase === 'live'
								? 'Starting'
								: phase === 'ended' || phase === 'ended_confirming'
									? 'Ended'
									: 'Standby'}
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
			{phase === 'viewing' ? 'Conditions' : 'View Pass'}
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
				{#if phase === 'viewing'}
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
							{phase}
							{demandRegistered}
							{demandLoading}
							{demandError}
							{relayStale}
							onStartStream={registerDemand}
						/>
					</div>
				{/if}
				<TelemetryFooter />
			</DrawerContent>
		</Drawer>
	</aside>
</div>
