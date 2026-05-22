<script lang="ts">
	import { Waves } from '@lucide/svelte';
	import { FLOW_GAUGE_HIGH_CFS, FLOW_GAUGE_LOW_CFS, mixOklch } from '$lib/gauge-scale';
	import SegmentGauge from './SegmentGauge.svelte';

	const SEGMENTS = 36;

	let {
		valueCfs = null,
		lowCfs = FLOW_GAUGE_LOW_CFS,
		highCfs = FLOW_GAUGE_HIGH_CFS,
		label = 'River Flow'
	}: {
		valueCfs?: number | null;
		lowCfs?: number;
		highCfs?: number;
		label?: string;
	} = $props();

	function segmentColor(index: number) {
		const percent = (index / (SEGMENTS - 1)) * 100;
		return mixOklch('var(--gauge-flow-low)', 'var(--gauge-flow-high)', percent);
	}
</script>

<SegmentGauge
	{label}
	unit="cfs"
	value={valueCfs}
	low={lowCfs}
	high={highCfs}
	{segmentColor}
	lowAccentClass="@[18rem]:text-(--gauge-flow-low)"
	highAccentClass="@[18rem]:text-(--gauge-flow-high)"
	icon={Waves}
/>
