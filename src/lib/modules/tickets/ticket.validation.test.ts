import { expect, test } from 'vitest';
import {
	addTicketNoteSchema,
	createTicketSchema,
	updateTicketStatusSchema
} from './ticket.validation';

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

const ticketId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

test('trims a note', () => {
	const note = addTicketNoteSchema.parse({
		ticketId,
		kind: 'phone_call',
		body: '  Called back.\n'
	});

	expect(note).toEqual({ ticketId, kind: 'phone_call', body: 'Called back.' });
});

test('rejects a blank note', () => {
	const result = addTicketNoteSchema.safeParse({ ticketId, kind: 'internal_note', body: ' \n ' });

	expect(result.success).toBe(false);
});

test('rejects a note over 10,000 characters', () => {
	expect(
		addTicketNoteSchema.safeParse({ ticketId, kind: 'internal_note', body: 'x'.repeat(10_000) })
			.success
	).toBe(true);
	expect(
		addTicketNoteSchema.safeParse({ ticketId, kind: 'internal_note', body: 'x'.repeat(10_001) })
			.success
	).toBe(false);
});

test('rejects an unknown note kind', () => {
	const result = addTicketNoteSchema.safeParse({ ticketId, kind: 'email', body: 'Sent a mail.' });

	expect(result.success).toBe(false);
});

test('rejects a status update with an invalid note', () => {
	const result = updateTicketStatusSchema.safeParse({
		ticketId,
		status: 'in_progress',
		expectedVersion: 1,
		note: { kind: 'internal_note', body: '' }
	});

	expect(result.success).toBe(false);

	if (!result.success) {
		expect(result.error.issues[0]?.path).toEqual(['note', 'body']);
	}
});
