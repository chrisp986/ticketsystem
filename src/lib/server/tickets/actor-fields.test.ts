import { describe, expect, test } from 'vitest';

import { actorFields, actorFromFields } from './actor-fields';

describe('actor fields', () => {
	test('a user is stored by ID', () => {
		expect(actorFields({ type: 'user', id: 'user-1' })).toEqual({
			actorType: 'user',
			actorId: 'user-1',
			actorName: null
		});
	});

	test('the system and AI are stored by name', () => {
		expect(actorFields({ type: 'system', name: 'email-sync' })).toEqual({
			actorType: 'system',
			actorId: null,
			actorName: 'email-sync'
		});
		expect(actorFields({ type: 'ai', name: 'qwen3-8b/summary-v1' })).toEqual({
			actorType: 'ai',
			actorId: null,
			actorName: 'qwen3-8b/summary-v1'
		});
	});

	test('stored fields give back the actor', () => {
		for (const actor of [
			{ type: 'user', id: 'user-1' },
			{ type: 'system', name: 'overdue-job' },
			{ type: 'ai', name: 'qwen3-8b/summary-v1' }
		] as const) {
			expect(actorFromFields(actorFields(actor))).toEqual(actor);
		}
	});
});
