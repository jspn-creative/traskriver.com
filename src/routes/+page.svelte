<script lang="ts">
	import VideoPlayer from '$lib/components/VideoPlayer.svelte';

	let { data } = $props<{
		data: { streamUrl: string | null };
	}>();
</script>

<svelte:head>
	<title>River Stream</title>
	<meta
		name="description"
		content="Local proof of concept for a subscription-gated river conditions livestream."
	/>
</svelte:head>

<div class="min-h-screen bg-slate-950 text-white">
	<div class="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-10 px-6 py-10">
		<div class="space-y-4">
			<p class="text-sm font-medium tracking-[0.3em] text-cyan-300/80 uppercase">
				Charter Guide POC
			</p>
			<h1 class="max-w-3xl text-4xl font-semibold text-balance sm:text-6xl">
				Private river conditions stream for subscribed guides.
			</h1>
			<p class="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
				Local HLS playback from FFmpeg. POC uses a test-access gate; Stripe can be wired in later.
			</p>
		</div>

		{#if data.streamUrl}
			<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
				<VideoPlayer src={data.streamUrl} />

				<div class="rounded-3xl border border-white/10 bg-white/5 p-6">
					<p class="text-sm font-medium text-emerald-300">Access active</p>
					<h2 class="mt-3 text-2xl font-semibold">Live feed unlocked</h2>
					<p class="mt-3 text-sm leading-6 text-slate-300">
						The player is using `/stream/index.m3u8`. Run `bun run stream` to refresh the local HLS
						output.
					</p>
				</div>
			</div>
		{:else}
			<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
				<div class="rounded-3xl border border-white/10 bg-white/5 p-8">
					<h2 class="text-2xl font-semibold sm:text-3xl">View the test feed</h2>
					<p class="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
						Unlock the local HLS stream for this POC. No payment required.
					</p>

					<form method="POST" action="/api/test-access" class="mt-8">
						<button
							type="submit"
							class="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
						>
							View the test feed
						</button>
					</form>
				</div>

				<div class="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
					<h3 class="text-lg font-semibold">Local setup</h3>
					<ul class="mt-4 space-y-3 text-sm leading-6 text-slate-300">
						<li>1. Add <code>CAMERA_RTSP_URL</code> to <code>.env</code>.</li>
						<li>
							2. Run <code>bun run stream</code> to write HLS into <code>static/stream</code>.
						</li>
						<li>3. Click “View the test feed” above.</li>
					</ul>
				</div>
			</div>
		{/if}
	</div>
</div>
