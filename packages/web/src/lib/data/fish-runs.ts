export interface FishRun {
	species: string;
	months: number[]; // 1-indexed (1=Jan, 12=Dec)
	peak: number[]; // peak months subset
	note: string; // e.g. "Winter run"
}

const TRASK_RIVER_FISH_RUNS: FishRun[] = [
	{
		species: 'Chinook Salmon',
		months: [9, 10, 11],
		peak: [10, 11],
		note: 'Fall run'
	},
	{
		species: 'Coho Salmon',
		months: [10, 11, 12],
		peak: [11],
		note: 'Fall/winter run'
	},
	{
		species: 'Winter Steelhead',
		months: [12, 1, 2, 3, 4],
		peak: [1, 2, 3],
		note: 'Winter run'
	},
	{
		species: 'Summer Steelhead',
		months: [5, 6, 7, 8],
		peak: [6, 7],
		note: 'Summer run'
	},
	{
		species: 'Cutthroat Trout',
		months: [7, 8, 9, 10, 11],
		peak: [9, 10],
		note: 'Sea-run'
	}
];

export function getCurrentFishRuns(month?: number) {
	const m = month ?? new Date().getMonth() + 1;
	const active = TRASK_RIVER_FISH_RUNS.filter((r) => r.months.includes(m));
	return {
		active,
		isPeak: (run: FishRun) => run.peak.includes(m)
	};
}
