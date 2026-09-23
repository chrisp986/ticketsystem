import { expect, test } from 'vitest';
import { createTicketSchema } from './ticket.validation';

test('allows creating a ticket with an empty subject', () => {
	const ticket = createTicketSchema.parse({
		subject: ''
	});

	expect(ticket.subject).toBe('');
});
