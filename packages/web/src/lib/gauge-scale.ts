/** Typical display range for USGS 14302480 (Trask River at Hwy 101). */
export const FLOW_GAUGE_LOW_CFS = 50;
export const FLOW_GAUGE_HIGH_CFS = 800;
export const TEMP_GAUGE_LOW_F = 38;
export const TEMP_GAUGE_HIGH_F = 68;

export function clampRatio(current: number, low: number, high: number) {
	if (high <= low) return 0;
	return Math.max(0, Math.min(1, (current - low) / (high - low)));
}

export function mixOklch(from: string, to: string, percent: number) {
	return `color-mix(in oklch, ${to} ${percent}%, ${from})`;
}
