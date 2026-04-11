<script lang="ts">
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { getCurrentFishRuns } from '$lib/data/fish-runs';

	const { active, isPeak } = getCurrentFishRuns();
</script>

<div
	in:fly={{ y: 16, duration: 700, delay: 200, easing: cubicOut }}
	class="flex flex-col px-5 py-8 md:px-12"
>
	<div class="mb-2">
		<h2 class="text-2xs font-medium tracking-label text-secondary uppercase">Fish Runs</h2>
		<p class="font-display text-xl font-semibold tracking-tight text-primary">In Season</p>
	</div>

	{#if active.length === 0}
		<p class="mt-4 text-sm text-secondary">No active fish runs this month.</p>
	{:else}
		<div class="mt-4 flex flex-col gap-3">
			{#each active as run}
				<div
					class="flex items-center justify-between border-b border-sepia pb-3 last:border-0 last:pb-0"
				>
					<div class="flex flex-col gap-0.5">
						<span class="text-sm font-medium text-primary">{run.species}</span>
						<span class="text-2xs text-secondary">{run.note}</span>
					</div>
					{#if isPeak(run)}
						<span
							class="rounded-sm bg-emerald-700/10 px-2 py-0.5 text-2xs font-medium text-emerald-700"
							>Peak</span
						>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
