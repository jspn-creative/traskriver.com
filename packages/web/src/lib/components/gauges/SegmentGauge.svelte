<script lang="ts">
	import type { Component } from 'svelte';
	import { clampRatio } from '$lib/gauge-scale';

	const SEGMENTS = 36;

	type IconComponent = Component<{ class?: string; strokeWidth?: number }>;

	let {
		label,
		unit,
		value = null,
		low,
		high,
		formatBound = (n: number) => String(n),
		segmentColor,
		lowAccentClass = '',
		highAccentClass = '',
		icon: Icon,
		iconMonoClass = 'text-secondary/80',
		iconAccentClass = '@[14rem]:text-accent-warm',
		iconBgMonoClass = 'bg-secondary/12',
		iconBgAccentClass = '@[14rem]:bg-accent-warm/10'
	}: {
		label: string;
		unit: string;
		value?: number | null;
		low: number;
		high: number;
		formatBound?: (n: number) => string;
		segmentColor: (index: number) => string;
		lowAccentClass?: string;
		highAccentClass?: string;
		icon: IconComponent;
		iconMonoClass?: string;
		iconAccentClass?: string;
		iconBgMonoClass?: string;
		iconBgAccentClass?: string;
	} = $props();

	let segments = $derived(Array.from({ length: SEGMENTS }, (_, i) => i));
	let ratio = $derived(value !== null ? clampRatio(value, low, high) : 0);
	let activeIndex = $derived(value !== null ? Math.round(ratio * (SEGMENTS - 1)) : -1);
	let displayValue = $derived(value !== null ? Math.round(value) : null);
</script>

<div class="@container min-w-0 lining-nums">
	<div class="flex flex-col gap-[clamp(0.5rem,4cqw,1.25rem)]">
		<div class="flex items-end justify-between gap-[clamp(0.375rem,3cqw,1rem)]">
			<div class="min-w-0">
				<p class="text-2xs font-medium tracking-label whitespace-nowrap text-secondary uppercase">
					{label}
				</p>
				<div class="mt-0.5 flex items-start gap-0.5 @[18rem]:mt-1">
					<span
						class="font-display text-xl font-light tracking-tight text-primary @[18rem]:text-5xl @[18rem]:tracking-tighter"
					>
						{displayValue ?? '—'}
					</span>
					<span class="mt-0.5 text-xs font-medium text-secondary @[18rem]:mt-1.5 @[18rem]:text-lg"
						>{unit}</span
					>
				</div>
			</div>
			<div
				class="mb-0.5 flex size-7 shrink-0 items-center justify-center rounded-full {iconBgMonoClass} {iconBgAccentClass} @[18rem]:size-11"
			>
				<Icon
					class="size-3.5 {iconMonoClass} {iconAccentClass} @[18rem]:size-5"
					strokeWidth={1.75}
				/>
			</div>
		</div>

		<div class="flex items-center gap-[clamp(0.375rem,5cqw,1.5rem)]">
			<div class="hidden min-w-7 flex-col items-center @[14rem]:flex">
				<span class="text-xs font-semibold text-secondary {lowAccentClass}">{formatBound(low)}</span
				>
				<span class="text-[10px] font-medium text-secondary/70 uppercase">Low</span>
			</div>

			<div
				class="flex min-w-0 flex-1 items-center justify-between gap-px @[18rem]:gap-[clamp(2px,1cqw,6px)]"
				role="meter"
				aria-valuemin={low}
				aria-valuemax={high}
				aria-valuenow={displayValue ?? undefined}
				aria-label={label}
			>
				{#each segments as i (i)}
					{@const filled = activeIndex >= 0 && i < activeIndex}
					{@const active = activeIndex >= 0 && i === activeIndex}
					<div
						class="min-w-0 flex-1 rounded-full transition-[opacity,height,box-shadow,background-color] duration-500 ease-out
							@max-[14rem]:bg-secondary/50
							{filled || active ? '@max-[14rem]:bg-primary @max-[14rem]:opacity-100' : '@max-[14rem]:opacity-35'}
							@[14rem]:[background-color:var(--seg)]
							{filled || active ? '@[14rem]:opacity-100' : '@[14rem]:opacity-20'}
							{active ? 'h-5 shadow-[0_0_10px_rgba(0,0,0,0.08)] @[18rem]:h-8' : 'h-2.5 @[18rem]:h-4'}"
						style="--seg: {segmentColor(i)}; transition-delay: {i * 12}ms"
					></div>
				{/each}
			</div>

			<div class="hidden min-w-7 flex-col items-center @[14rem]:flex">
				<span class="text-xs font-semibold text-secondary {highAccentClass}"
					>{formatBound(high)}</span
				>
				<span class="text-[10px] font-medium text-secondary/70 uppercase">High</span>
			</div>
		</div>
	</div>
</div>
