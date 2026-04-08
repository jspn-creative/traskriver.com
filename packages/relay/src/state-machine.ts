import type { RelayInternalState } from '@river-stream/shared';
import { log } from './logger';

export interface TransitionEvent {
	from: RelayInternalState;
	to: RelayInternalState;
	reason: string;
	timestamp: number;
}

const validTransitions = new Map<RelayInternalState, Set<RelayInternalState>>([
	['idle', new Set(['starting'])],
	['starting', new Set(['live', 'cooldown'])],
	['live', new Set(['stopping'])],
	['stopping', new Set(['cooldown', 'idle'])],
	['cooldown', new Set(['idle'])]
]);

export class RelayStateMachine {
	private state: RelayInternalState = 'idle';
	private listeners: Array<(event: TransitionEvent) => void> = [];

	getState() {
		return this.state;
	}

	transition(to: RelayInternalState, reason: string) {
		const from = this.state;
		const allowed = validTransitions.get(from);
		if (!allowed?.has(to)) {
			log.warn(`invalid transition: ${from} → ${to} (${reason})`);
			return false;
		}

		this.state = to;
		const event: TransitionEvent = { from, to, reason, timestamp: Date.now() };
		log.state(from, to, reason);
		for (const listener of this.listeners) {
			listener(event);
		}
		return true;
	}

	onTransition(callback: (event: TransitionEvent) => void) {
		this.listeners.push(callback);
	}
}
