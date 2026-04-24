import { watch, type FSWatcher } from 'node:fs';
import type { Logger } from 'pino';

export class SegmentWatcher {
	private readonly dir: string;
	private readonly log: Logger;
	private watcher: FSWatcher | null = null;
	private lastWriteAt: number | null = null;

	constructor(dir: string, log: Logger) {
		this.dir = dir;
		this.log = log;
	}

	start() {
		this.watcher = watch(this.dir, { persistent: false }, (_eventType, filename) => {
			if (!filename) return;
			const name = typeof filename === 'string' ? filename : String(filename);
			if (!name.endsWith('.ts')) return;
			this.lastWriteAt = Date.now();
		});
		this.watcher.on('error', (err) => this.log.warn({ err }, 'segment watcher error'));
	}

	stop() {
		this.watcher?.close();
		this.watcher = null;
	}

	getLastWriteAt(): number | null {
		return this.lastWriteAt;
	}
}
