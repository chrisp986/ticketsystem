import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, test } from 'vitest';

import type { Actor } from '../../src/lib/modules/tickets/ticket.types';
import { ticketNotes } from '../../src/lib/server/db/schema/ticket-notes';
import { ticketStatusHistory } from '../../src/lib/server/db/schema/ticket-status-history';
import { tickets } from '../../src/lib/server/db/schema/tickets';
import { addTicketNote } from '../../src/lib/server/tickets/add-ticket-note';
import { createTicket } from '../../src/lib/server/tickets/create-ticket';
import { loadTicketTimeline } from '../../src/lib/server/tickets/ticket-timeline';
import { updateTicketStatus } from '../../src/lib/server/tickets/update-ticket-status';
import {
	deleteTestTicket,
	deleteTestUsers,
	insertTestUser,
	testCreator,
	testDb,
	testPool
} from './helpers/db';

const ticketIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
	for (const id of ticketIds.splice(0)) {
		await deleteTestTicket(id);
	}

	await deleteTestUsers(userIds.splice(0));
});

afterAll(async () => {
	await testPool.end();
});

async function agent(): Promise<Actor & { type: 'user' }> {
	const created = await insertTestUser();
	userIds.push(created.id);
	return { type: 'user', id: created.id };
}

async function create(actor: Actor) {
	const created = await createTicket(
		testDb,
		{ subject: 'Integration test: notes', priority: 'medium', source: 'manual', tags: [] },
		actor
	);

	if (created === 'inactive_user') {
		throw new Error('Test ticket was not created.');
	}

	ticketIds.push(created.id);
	return created;
}

async function storedTicket(ticketId: string) {
	const [stored] = await testDb.select().from(tickets).where(eq(tickets.id, ticketId));
	return stored;
}

async function notesOf(ticketId: string) {
	return testDb.select().from(ticketNotes).where(eq(ticketNotes.ticketId, ticketId));
}

describe('adding a note', () => {
	test('stores the note with its author and leaves the ticket unchanged', async () => {
		const anna = await agent();
		const ticket = await create(anna);

		const outcome = await addTicketNote(
			testDb,
			{ ticketId: ticket.id, kind: 'phone_call', body: 'Customer called, part ordered.' },
			anna
		);

		expect(outcome).toBe('added');
		expect(await notesOf(ticket.id)).toMatchObject([
			{ kind: 'phone_call', body: 'Customer called, part ordered.', authorId: anna.id }
		]);
		// A note neither clears attention nor changes the status or version (ADR 0005).
		expect(await storedTicket(ticket.id)).toMatchObject({
			status: 'new',
			version: ticket.version,
			updatedAt: ticket.updatedAt,
			attentionReason: 'new_ticket'
		});
	});

	test('is possible on a closed ticket', async () => {
		const anna = await agent();
		const closedAt = new Date('2026-01-02T00:00:00.000Z');
		const [ticket] = await testDb
			.insert(tickets)
			.values({
				...testCreator,
				subject: 'Integration test: note on a closed ticket',
				status: 'closed',
				closedAt,
				updatedAt: closedAt,
				resolution: 'withdrawn',
				nextStep: null,
				nextStepDue: null
			})
			.returning();

		if (!ticket) {
			throw new Error('Test ticket was not created.');
		}

		ticketIds.push(ticket.id);

		const outcome = await addTicketNote(
			testDb,
			{ ticketId: ticket.id, kind: 'on_site', body: 'Checked the printer on site.' },
			anna
		);

		expect(outcome).toBe('added');
		expect(await notesOf(ticket.id)).toHaveLength(1);
		expect(await storedTicket(ticket.id)).toMatchObject({ status: 'closed', version: 1 });
	});

	test('reports a missing ticket', async () => {
		const anna = await agent();

		const outcome = await addTicketNote(
			testDb,
			{ ticketId: crypto.randomUUID(), kind: 'internal_note', body: 'Lost note.' },
			anna
		);

		expect(outcome).toBe('not_found');
	});

	test('is refused for a system actor', async () => {
		const anna = await agent();
		const ticket = await create(anna);

		await expect(
			addTicketNote(
				testDb,
				{ ticketId: ticket.id, kind: 'internal_note', body: 'Written by a job.' },
				{ type: 'system', name: 'email-sync' }
			)
		).rejects.toThrow('Only users write ticket notes');
		expect(await notesOf(ticket.id)).toHaveLength(0);
	});
});

describe('note constraints', () => {
	test('rejects a blank note', async () => {
		const anna = await agent();
		const ticket = await create(anna);

		await expect(
			testDb
				.insert(ticketNotes)
				.values({ ticketId: ticket.id, kind: 'internal_note', body: '  \n ', authorId: anna.id })
		).rejects.toMatchObject({ cause: { code: '23514', constraint: 'ticket_notes_body_valid' } });
	});

	test('rejects a note over 10,000 characters', async () => {
		const anna = await agent();
		const ticket = await create(anna);

		await expect(
			testDb.insert(ticketNotes).values({
				ticketId: ticket.id,
				kind: 'internal_note',
				body: 'x'.repeat(10_001),
				authorId: anna.id
			})
		).rejects.toMatchObject({ cause: { code: '23514', constraint: 'ticket_notes_body_valid' } });
	});

	test('rejects a note by an unknown author', async () => {
		const anna = await agent();
		const ticket = await create(anna);

		await expect(
			testDb.insert(ticketNotes).values({
				ticketId: ticket.id,
				kind: 'internal_note',
				body: 'Who wrote this?',
				authorId: crypto.randomUUID()
			})
		).rejects.toMatchObject({
			cause: { code: '23503', constraint: 'ticket_notes_author_id_users_id_fk' }
		});
	});

	test('keeps a ticket with notes from being deleted', async () => {
		const anna = await agent();
		// Inserted directly, so no attention event holds the ticket as well.
		const [ticket] = await testDb
			.insert(tickets)
			.values({ ...testCreator, subject: 'Integration test: note keeps ticket', status: 'new' })
			.returning();

		if (!ticket) {
			throw new Error('Test ticket was not created.');
		}

		ticketIds.push(ticket.id);

		await addTicketNote(
			testDb,
			{ ticketId: ticket.id, kind: 'internal_note', body: 'Keep me.' },
			anna
		);

		await expect(testDb.delete(tickets).where(eq(tickets.id, ticket.id))).rejects.toMatchObject({
			cause: { code: '23001', constraint: 'ticket_notes_ticket_id_tickets_id_fk' }
		});
	});
});

describe('a note with a status change', () => {
	test('is written in the same transaction and timestamp as the change', async () => {
		const anna = await agent();
		const ticket = await create(anna);

		const outcome = await updateTicketStatus(
			testDb,
			{
				ticketId: ticket.id,
				status: 'waiting_internal',
				expectedVersion: ticket.version,
				nextStep: 'Wait for the part',
				nextStepDue: new Date(Date.now() + 86_400_000),
				note: { kind: 'phone_call', body: 'Customer called, part ordered.' }
			},
			anna
		);

		expect(outcome).toBe('updated');

		const [note] = await notesOf(ticket.id);
		const [change] = await testDb
			.select()
			.from(ticketStatusHistory)
			.where(eq(ticketStatusHistory.ticketId, ticket.id));

		expect(note).toMatchObject({ kind: 'phone_call', authorId: anna.id });
		expect(note?.createdAt).toEqual(change?.changedAt);
	});

	test('is not saved when the change is blocked', async () => {
		const anna = await agent();
		const ticket = await create(anna);

		const outcome = await updateTicketStatus(
			testDb,
			{
				ticketId: ticket.id,
				status: 'resolved',
				expectedVersion: ticket.version,
				note: { kind: 'internal_note', body: 'Resolved, I think.' }
			},
			anna
		);

		expect(outcome).toBe('resolution_required');
		expect(await notesOf(ticket.id)).toHaveLength(0);
	});

	test('is not saved on a version conflict', async () => {
		const anna = await agent();
		const ticket = await create(anna);

		const outcome = await updateTicketStatus(
			testDb,
			{
				ticketId: ticket.id,
				status: 'in_progress',
				expectedVersion: ticket.version + 1,
				note: { kind: 'internal_note', body: 'Too late.' }
			},
			anna
		);

		expect(outcome).toBe('conflict');
		expect(await notesOf(ticket.id)).toHaveLength(0);
	});

	test('is not saved when the status does not change', async () => {
		const anna = await agent();
		const ticket = await create(anna);

		const outcome = await updateTicketStatus(
			testDb,
			{
				ticketId: ticket.id,
				status: 'new',
				expectedVersion: ticket.version,
				note: { kind: 'internal_note', body: 'Only a note.' }
			},
			anna
		);

		expect(outcome).toBe('unchanged');
		expect(await notesOf(ticket.id)).toHaveLength(0);
		expect(await storedTicket(ticket.id)).toMatchObject({ version: ticket.version });
	});
});

describe('timeline', () => {
	test('shows a note before the status change it explains', async () => {
		const anna = await agent();
		const ticket = await create(anna);

		await new Promise((resolve) => setTimeout(resolve, 5));

		await updateTicketStatus(
			testDb,
			{
				ticketId: ticket.id,
				status: 'in_progress',
				expectedVersion: ticket.version,
				nextStep: 'Check the cable next week',
				note: { kind: 'on_site', body: 'On site: replaced the cable.' }
			},
			anna
		);

		const timeline = await loadTicketTimeline(testDb, ticket);

		// Newest first: effects of the change, the change, then the note that explains it.
		expect(timeline.map((entry) => entry.kind)).toEqual([
			'attention',
			'assignment',
			'assignment',
			'status',
			'note',
			'attention',
			'created'
		]);
		expect(timeline[4]).toMatchObject({
			kind: 'note',
			noteKind: 'on_site',
			body: 'On site: replaced the cable.',
			actor: anna
		});
	});
});
