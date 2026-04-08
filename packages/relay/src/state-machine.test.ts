import { describe, expect, it } from 'bun:test';
import { RelayStateMachine } from './state-machine';

describe('RelayStateMachine', () => {
	it('starts idle and validates transitions', () => {
		const machine = new RelayStateMachine();

		expect(machine.getState()).toBe('idle');
		expect(machine.transition('starting', 'demand detected')).toBe(true);
		expect(machine.transition('live', 'stable')).toBe(true);
		expect(machine.transition('idle', 'invalid direct stop')).toBe(false);
	});
});
