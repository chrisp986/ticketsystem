import { expect, test } from 'vitest';

import { defaultNextStepDue } from './ticket.due';

const fridayMorning = new Date('2026-10-09T10:00:00+02:00');

test.each([
	['new', 'medium', '2026-10-09T09:00:00.000Z'],
	['in_progress', 'critical', '2026-10-09T10:00:00.000Z'],
	['in_progress', 'high', '2026-10-09T12:00:00.000Z'],
	['in_progress', 'medium', '2026-10-12T08:00:00.000Z'],
	['in_progress', 'low', '2026-10-13T08:00:00.000Z'],
	['waiting_customer', 'medium', '2026-10-14T08:00:00.000Z'],
	['waiting_internal', 'medium', '2026-10-13T08:00:00.000Z'],
	['resolved', 'medium', '2026-10-16T08:00:00.000Z']
] as const)('%s with %s priority', (status, priority, expected) => {
	expect(defaultNextStepDue(status, priority, fridayMorning)?.toISOString()).toBe(expected);
});

test('closed tickets have no due date', () => {
	expect(defaultNextStepDue('closed', 'critical', fridayMorning)).toBeNull();
});
