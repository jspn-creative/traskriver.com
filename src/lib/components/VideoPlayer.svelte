<script lang="ts">
	import { defineCustomElements } from 'vidstack/elements';

	let {
		liveSrc,
		poster,
		class: className,
		sessionActive = false,
		onPlaying
	} = $props<{
		liveSrc: string;
		poster?: string;
		class?: string;
		sessionActive?: boolean;
		onPlaying?: () => void;
	}>();

	let container: HTMLDivElement | undefined = $state();
	let isFullscreen = $state(false);
	let isPlaying = $state(false);

	$effect(() => {
		// Initialize vidstack
		void defineCustomElements();
	});

	$effect(() => {
		const onFsChange = () => {
			isFullscreen = !!document.fullscreenElement;
		};

		document.addEventListener('fullscreenchange', onFsChange);
		return () => document.removeEventListener('fullscreenchange', onFsChange);
	});

	const fsLabel = $derived(isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen');

	const onLivePlaying = () => {
		isPlaying = true;
		onPlaying?.();
	};

	const toggleFullscreen = () => {
		if (!container) return;
		if (document.fullscreenElement) void document.exitFullscreen();
		else void container.requestFullscreen();
	};
</script>

<div
	bind:this={container}
	class="group relative overflow-hidden bg-black {className ||
		'rounded-3xl border border-white/10 shadow-2xl shadow-black/30'}"
>
	<media-player
		title="River Stream"
		src={liveSrc}
		{poster}
		autoplay
		muted
		playsinline
		stream-type="live"
		class="absolute inset-0 h-full w-full"
		onplaying={onLivePlaying}
	>
		<media-outlet></media-outlet>
	</media-player>

	<div
		class="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-6 py-6 opacity-0 transition-all duration-300 ease-out group-hover:opacity-100"
	>
		<span
			class="rounded-sm px-2 py-1 text-2xs font-semibold tracking-label text-white shadow-sm {!isPlaying
				? 'bg-amber-600/90'
				: 'bg-[#BC4B31]/90'}"
		>
			{!isPlaying ? 'STANDBY' : 'LIVE'}
		</span>

		<button
			onclick={toggleFullscreen}
			aria-label={fsLabel}
			disabled={!sessionActive}
			class="rounded-sm text-white/70 transition-all duration-200 focus-visible:outline-none {sessionActive
				? 'cursor-pointer hover:scale-110 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50 active:scale-95'
				: 'pointer-events-none opacity-0'}"
		>
			{#if isFullscreen}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="currentColor"
					class="size-5"
					aria-hidden="true"
				>
					<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
				</svg>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="currentColor"
					class="size-5"
					aria-hidden="true"
				>
					<path
						d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
					/>
				</svg>
			{/if}
		</button>
	</div>
</div>
