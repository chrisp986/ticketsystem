import { expect, test } from 'vitest';

import { ticketStatuses } from './ticket.constants';
import { canTransition } from './ticket.transitions';

// Written out from ADR 0001 on purpose. Deriving it from the map would test nothing.
const expectedAllowed = new Set([
	'new->in_progress',
	'new->waiting_customer',
	'new->waiting_internal',
	'new->resolved',
	'new->closed',
	'in_progress->waiting_customer',
	'in_progress->waiting_internal',
	'in_progress->resolved',
	'in_progress->closed',
	'waiting_customer->in_progress',
	'waiting_customer->waiting_internal',
	'waiting_customer->resolved',
	'waiting_customer->closed',
	'waiting_internal->in_progress',
	'waiting_internal->waiting_customer',
	'waiting_internal->resolved',
	'waiting_internal->closed',
	'resolved->in_progress',
	'resolved->closed'
]);

const allPairs = ticketStatuses.flatMap((from) => ticketStatuses.map((to) => [from, to] as const));

test.each(allPairs)('%s -> %s', (from, to) => {
	expect(canTransition(from, to)).toBe(expectedAllowed.has(`${from}->${to}`));
});
