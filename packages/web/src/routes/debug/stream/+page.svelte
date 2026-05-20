<script lang="ts">
	import { onMount } from 'svelte';
	import VidstackDebugPlayer from '$lib/components/VidstackDebugPlayer.svelte';
	import StreamDebugProbe from '$lib/components/StreamDebugProbe.svelte';
	import defaultJpg from '$lib/assets/default.jpg';
	import type { StreamDiagnostic } from '$lib/stream-diagnostics';
	import { collectStreamCapabilities } from '$lib/stream-diagnostics';
	import * as env from '$env/static/public';
	import posthog from 'posthog-js';

	type DebugRow = {
		probe: string;
		type: string;
		elapsedMs?: number;
		detail?: Record<string, unknown>;
	};
	type Probe = 'idle' | 'vidstack' | 'raw-hls' | 'native-hls';

	let rows = $state<DebugRow[]>([]);
	let activeProbe = $state<Probe>('idle');
	const streamSessionId =
		typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID()
			: Math.random().toString(36).slice(2);
	const pageStartedAt = Date.now();

	const client = () => {
		if (typeof navigator === 'undefined') return {};
		const connection = (
			navigator as Navigator & {
				connection?: {
					effectiveType?: string;
					downlink?: number;
					rtt?: number;
					saveData?: boolean;
				};
			}
		).connection;
		return {
			user_agent: navigator.userAgent,
			platform: navigator.platform,
			visibility_state: typeof document === 'undefined' ? null : document.visibilityState,
			connection_effective_type: connection?.effectiveType ?? null,
			connection_downlink: connection?.downlink ?? null,
			connection_rtt: connection?.rtt ?? null,
			connection_save_data: connection?.saveData ?? null
		};
	};

	const push = (row: DebugRow) => {
		rows = [row, ...rows].slice(0, 150);
		const properties = {
			stream_session_id: streamSessionId,
			diagnostic_type: row.type,
			debug_probe: row.probe,
			live_src: env.PUBLIC_STREAM_HLS_URL,
			page_elapsed_ms: Date.now() - pageStartedAt,
			...row,
			...client()
		};
		if (row.type.includes('error') || row.type.includes('hung') || row.type.includes('rejected')) {
			console.warn(`[stream-debug] ${row.probe}: ${row.type}`, properties);
		} else {
			console.log(`[stream-debug] ${row.probe}: ${row.type}`, properties);
		}
		posthog.capture('stream_debug_diagnostic', properties);
	};

	const selectProbe = (probe: Probe) => {
		activeProbe = probe;
		rows = [];
		push({
			probe,
			type: 'probe_selected',
			elapsedMs: 0,
			detail: { liveSrc: env.PUBLIC_STREAM_HLS_URL }
		});
	};

	const onVidstackDiagnostic = (diagnostic: StreamDiagnostic) => {
		push({
			probe: 'vidstack',
			type: diagnostic.type,
			elapsedMs: diagnostic.elapsedMs,
			detail: diagnostic as unknown as Record<string, unknown>
		});
	};

	const onRawDiagnostic = (event: {
		type: string;
		elapsedMs: number;
		probeMode: 'raw-hls' | 'native-hls';
		detail?: Record<string, unknown>;
	}) => {
		push({
			probe: event.probeMode,
			type: event.type,
			elapsedMs: event.elapsedMs,
			detail: event.detail
		});
	};

	onMount(() => {
		console.log('[stream-debug] page mounted', {
			stream_session_id: streamSessionId,
			live_src: env.PUBLIC_STREAM_HLS_URL,
			capabilities: collectStreamCapabilities(document.createElement('video')),
			...client()
		});
	});
</script>

<svelte:head>
	<title>Stream Debug | Trask River</title>
</svelte:head>

<main class="min-h-dvh bg-primary px-4 py-5 font-body text-light md:px-6 lg:px-8">
	<div class="mx-auto grid max-w-7xl gap-5">
		<header class="grid gap-2">
			<div class="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 class="font-display text-3xl font-semibold">Stream Debug</h1>
					<p class="text-sm text-light/65">{env.PUBLIC_STREAM_HLS_URL}</p>
				</div>
				<div
					class="rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-light/70"
				>
					session {streamSessionId}
				</div>
			</div>
			<p class="max-w-3xl text-sm leading-relaxed text-light/70">
				This page runs Vidstack, raw hls.js, and native HLS against the same source so a failing
				browser can identify whether the issue is player state, hls.js/MSE, native HLS, or stream
				decoding.
			</p>
		</header>

		<div class="flex flex-wrap gap-2">
			<button
				class="rounded-sm px-3 py-2 text-xs font-medium {activeProbe === 'vidstack'
					? 'bg-light text-primary'
					: 'bg-white/10 text-light/80 hover:bg-white/15'}"
				onclick={() => selectProbe('vidstack')}
			>
				Vidstack
			</button>
			<button
				class="rounded-sm px-3 py-2 text-xs font-medium {activeProbe === 'raw-hls'
					? 'bg-light text-primary'
					: 'bg-white/10 text-light/80 hover:bg-white/15'}"
				onclick={() => selectProbe('raw-hls')}
			>
				Raw hls.js
			</button>
			<button
				class="rounded-sm px-3 py-2 text-xs font-medium {activeProbe === 'native-hls'
					? 'bg-light text-primary'
					: 'bg-white/10 text-light/80 hover:bg-white/15'}"
				onclick={() => selectProbe('native-hls')}
			>
				Native HLS
			</button>
		</div>

		<section class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
			<article class="grid gap-3 rounded-md border border-white/10 bg-white/5 p-3">
				<div>
					<h2 class="text-sm font-semibold">
						{activeProbe === 'idle'
							? 'Select a Probe'
							: activeProbe === 'vidstack'
								? 'Vidstack'
								: activeProbe === 'raw-hls'
									? 'Raw hls.js'
									: 'Native HLS'}
					</h2>
					<p class="text-xs text-light/55">
						{activeProbe === 'idle'
							? 'No video player is loaded until you choose one.'
							: activeProbe === 'vidstack'
								? 'Current production player path'
								: activeProbe === 'raw-hls'
									? 'Plain video element with explicit anonymous CORS'
									: 'Direct video src for Safari/native-HLS browsers'}
					</p>
				</div>
				{#if activeProbe === 'idle'}
					<div
						class="grid aspect-video place-items-center rounded-md border border-dashed border-white/15 bg-black/30 p-6 text-center text-sm text-light/60"
					>
						Choose a probe above. Start with Raw hls.js, then compare Vidstack.
					</div>
				{:else if activeProbe === 'vidstack'}
					<div class="relative aspect-video overflow-hidden rounded-md bg-black">
						<VidstackDebugPlayer
							liveSrc={env.PUBLIC_STREAM_HLS_URL}
							poster={defaultJpg}
							class="h-full w-full rounded-none border-0 shadow-none"
							onDiagnostic={onVidstackDiagnostic}
						/>
					</div>
				{:else if activeProbe === 'raw-hls'}
					<StreamDebugProbe
						mode="raw-hls"
						liveSrc={env.PUBLIC_STREAM_HLS_URL}
						onDiagnostic={onRawDiagnostic}
					/>
				{:else}
					<StreamDebugProbe
						mode="native-hls"
						liveSrc={env.PUBLIC_STREAM_HLS_URL}
						onDiagnostic={onRawDiagnostic}
					/>
				{/if}
			</article>

			<section class="rounded-md border border-white/10 bg-black/35 p-4">
				<div class="mb-3 flex items-center justify-between gap-3">
					<h2 class="text-sm font-semibold">Event Log</h2>
					<button
						class="rounded-sm bg-white/10 px-3 py-1.5 text-xs text-light/80 hover:bg-white/15"
						onclick={() => (rows = [])}
					>
						Clear
					</button>
				</div>
				<div class="max-h-[62vh] overflow-auto font-mono text-[11px] leading-relaxed text-light/70">
					{#each rows as row, index (`${row.probe}-${row.type}-${row.elapsedMs ?? 0}-${index}`)}
						<div class="grid gap-1 border-b border-white/5 py-2">
							<div>
								<span class="text-amber-200">{row.elapsedMs ?? 0}ms</span>
								<span class="text-sky-200">{row.probe}</span>
								<span class="text-light">{row.type}</span>
							</div>
							<div class="break-words">{JSON.stringify(row.detail)}</div>
						</div>
					{/each}
				</div>
			</section>
		</section>
	</div>
</main>
