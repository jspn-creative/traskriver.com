<script lang="ts">
	let {
		phase,
		onStartStream,
		demandRegistered = false,
		demandLoading = false,
		demandError = null,
		relayStale = false
	} = $props<{
		phase: 'idle' | 'starting' | 'live' | 'viewing' | 'ended' | 'ended_confirming' | 'unavailable' | 'error';
		onStartStream: () => void;
		demandRegistered?: boolean;
		demandLoading?: boolean;
		demandError?: string | null;
		relayStale?: boolean;
	}>();

	const specs = [
		['Resolution', '2560×1920'],
		['Frame Rate', '20 FPS'],
		['Ad Interruptions', 'Only occasionally'],
		['I-frame Interval', '2×'],
		['Max Bitrate', '4096 Kbps']
	] as const;

	let sessionActive = $derived(phase !== 'idle' && phase !== 'ended' && phase !== 'error');
	let isStarting = $derived(phase === 'starting');
	let buttonDisabled = $derived((sessionActive && phase !== 'unavailable') || demandLoading);

	const ctaLabel = $derived(
		demandLoading
			? 'Starting stream…'
			: phase === 'starting'
				? 'Starting stream…'
				: phase === 'unavailable'
					? 'Try starting stream'
					: phase === 'live' || phase === 'viewing'
						? 'Stream active'
						: phase === 'ended' || phase === 'ended_confirming'
							? 'Stream ended'
							: phase === 'error'
								? 'Stream error'
								: 'Start stream'
	);
</script>

<div class="flex flex-1 flex-col px-5 py-8 md:px-12 md:py-16">
	<div>
		<div class="text-2xs font-medium tracking-label text-secondary uppercase">
			Limited Quantity Available:
		</div>
		<h1 class="mb-6 flex items-baseline font-display text-primary">
			<span
				class="text-6xl leading-[0.85] font-medium tracking-tight underline decoration-secondary/50 decoration-from-font [text-decoration-skip-ink:none]"
				>24</span
			>
			<span class="ml-2 text-3xl font-bold tracking-tight">Hour Day Pass</span>
		</h1>
		<p class="mb-10 text-sm leading-relaxed text-secondary">
			Immersive, uninterrupted access to our fixed-position river array. Video-only visual telemetry
			(2560×1920) from the Oregon Coast.
		</p>
	</div>

	<div class="mb-10 flex items-baseline gap-2">
		<span class="font-display text-6xl leading-none font-medium tracking-tight text-primary">
			<span class="mt-2 mr-1 font-display text-xl text-secondary">$</span>79
		</span>
		<span class="text-xs font-bold tracking-label text-secondary uppercase">USD</span>
	</div>

	<ul class="mb-12 flex list-none flex-col">
		{#each specs as [label, value] (label)}
			<li class="flex items-baseline justify-between border-b border-sepia py-3 first:pt-0">
				<span class="text-2xs font-medium tracking-label text-secondary uppercase">{label}</span>
				<span class="font-medium text-primary tabular-nums">{value}</span>
			</li>
		{/each}
	</ul>

	<div class="mt-auto flex flex-col gap-3">
		{#if isStarting && demandRegistered}
			<p class="animate-pulse text-center text-2xs text-secondary">
				{relayStale ? 'Relay appears offline — stream may take longer.' : 'Live feed connecting — please wait.'}
			</p>
		{/if}

		<button
			onclick={onStartStream}
			disabled={buttonDisabled}
			class="relative w-full overflow-hidden rounded-sm py-[18px] text-xs font-medium tracking-ui text-light transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-light focus-visible:outline-none {buttonDisabled
				? 'cursor-not-allowed shadow-inner'
				: 'cursor-pointer bg-primary hover:bg-primary/90 active:scale-[0.98]'} {isStarting ||
			demandLoading
				? 'bg-secondary/90'
				: phase === 'live' || phase === 'viewing'
					? 'bg-emerald-700/80'
					: 'bg-primary'}"
		>
			<div class="relative flex items-center justify-center gap-2">
				{#if isStarting || demandLoading}
					<svg
						class="h-4 w-4 animate-spin text-white/70"
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
				{:else if phase === 'live' || phase === 'viewing'}
					<svg
						class="h-4 w-4 text-white"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2.5"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
					</svg>
				{/if}
				<span>{ctaLabel}</span>
			</div>
		</button>
		{#if demandError}
			<p class="text-center text-2xs text-red-600" role="alert">{demandError}</p>
		{/if}
	</div>
</div>
