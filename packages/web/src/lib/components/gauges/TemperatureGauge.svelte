<script lang="ts">
	import { Sun } from '@lucide/svelte';
	import { TEMP_GAUGE_HIGH_F, TEMP_GAUGE_LOW_F, mixOklch } from '$lib/gauge-scale';
	import SegmentGauge from './SegmentGauge.svelte';

	const SEGMENTS = 36;

	let {
		valueF = null,
		lowF = TEMP_GAUGE_LOW_F,
		highF = TEMP_GAUGE_HIGH_F,
		label = 'Water Temp'
	}: {
		valueF?: number | null;
		lowF?: number;
		highF?: number;
		label?: string;
	} = $props();

	function segmentColor(index: number) {
		const percent = (index / (SEGMENTS - 1)) * 100;
		return mixOklch('var(--gauge-temp-cold)', 'var(--gauge-temp-hot)', percent);
	}
</script>

<SegmentGauge
	{label}
	unit="°F"
	value={valueF}
	low={lowF}
	high={highF}
	formatBound={(n) => `${n}°`}
	{segmentColor}
	lowAccentClass="@[18rem]:text-(--gauge-temp-cold)"
	highAccentClass="@[18rem]:text-(--gauge-temp-hot)"
	icon={Sun}
/>
