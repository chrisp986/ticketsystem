import { expect, test } from 'vitest';
import { createTicketSchema, updateTicketStatusSchema } from './ticket.validation';

test('allows creating a ticket with an empty subject', () => {
	const ticket = createTicketSchema.parse({
		subject: ''
	});

	expect(ticket.subject).toBe('');
});

test('defaults ticket priority to medium when omitted', () => {
	const ticket = createTicketSchema.parse({
		subject: 'Printer does not respond'
	});

	expect(ticket.priority).toBe('medium');
});

test('rejects an unsupported ticket priority', () => {
	const result = createTicketSchema.safeParse({
		subject: 'Printer does not respond',
		priority: 'urgent'
	});

	expect(result.success).toBe(false);

	if (!result.success) {
		expect(result.error.issues[0]?.path).toEqual(['priority']);
	}
});

test('rejects a status update with version zero', () => {
	const result = updateTicketStatusSchema.safeParse({
		ticketId: '550e8400-e29b-41d4-a716-446655440000',
		status: 'in_progress',
		expectedVersion: 0
	});

	expect(result.success).toBe(false);

	if (!result.success) {
		expect(result.error.issues[0]?.path).toEqual(['expectedVersion']);
	}
});

test('rejects a status update with an invalid ticket ID', () => {
	const result = updateTicketStatusSchema.safeParse({
		ticketId: 'not-a-uuid',
		status: 'in_progress',
		expectedVersion: 1
	});

	expect(result.success).toBe(false);

	if (!result.success) {
		expect(result.error.issues[0]?.path).toEqual(['ticketId']);
	}
});

test('accepts a valid status update', () => {
	const input = {
		ticketId: '550e8400-e29b-41d4-a716-446655440000',
		status: 'in_progress',
		expectedVersion: 1
	};

	const result = updateTicketStatusSchema.parse(input);

	expect(result).toEqual(input);
});
