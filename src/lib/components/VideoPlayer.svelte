<script lang="ts">
	import { defineCustomElements } from 'vidstack/elements';

	let { src } = $props<{ src: string }>();

	let container: HTMLDivElement | undefined = $state();
	let isFullscreen = $state(false);

	$effect(() => {
		void defineCustomElements();

		const onFsChange = () => {
			isFullscreen = !!document.fullscreenElement;
		};

		document.addEventListener('fullscreenchange', onFsChange);

		return () => document.removeEventListener('fullscreenchange', onFsChange);
	});

	const toggleFullscreen = () => {
		if (!container) return;
		if (document.fullscreenElement) void document.exitFullscreen();
		else void container.requestFullscreen();
	};
</script>

<div
	bind:this={container}
	class="group relative overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl shadow-black/30"
>
	<media-player
		title="River Stream"
		{src}
		autoplay
		muted
		playsinline
		stream-type="live"
		class="block w-full"
	>
		<media-outlet></media-outlet>
	</media-player>

	<div
		class="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-4 py-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
	>
		<span class="rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold tracking-widest text-white">
			LIVE
		</span>

		<button
			onclick={toggleFullscreen}
			aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
			class="text-white/70 transition-colors hover:text-white"
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
