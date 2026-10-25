import { asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, expect, test } from 'vitest';

import type { Actor } from '../../src/lib/modules/tickets/ticket.types';
import { ticketAssignmentHistory } from '../../src/lib/server/db/schema/ticket-assignment-history';
import { tickets } from '../../src/lib/server/db/schema/tickets';
import { assignTicket } from '../../src/lib/server/tickets/assign-ticket';
import { createTicket } from '../../src/lib/server/tickets/create-ticket';
import { updateTicketStatus } from '../../src/lib/server/tickets/update-ticket-status';
import {
	deleteTestTicket,
	deleteTestUsers,
	insertTestUser,
	testDb,
	testPool,
	testCreator
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

async function user(values: { name?: string; active?: boolean } = {}) {
	const created = await insertTestUser(values);
	userIds.push(created.id);
	return created;
}

function actorFor(userId: string): Actor {
	return { type: 'user', id: userId };
}

async function insertTicket(values: Partial<typeof tickets.$inferInsert> = {}) {
	const [created] = await testDb
		.insert(tickets)
		.values({ ...testCreator, subject: 'Integration test: ownership', status: 'new', ...values })
		.returning();

	if (!created) {
		throw new Error('Test ticket was not created.');
	}

	ticketIds.push(created.id);
	return created;
}

async function stored(ticketId: string) {
	const [ticket] = await testDb.select().from(tickets).where(eq(tickets.id, ticketId));
	return ticket;
}

async function history(ticketId: string) {
	return testDb
		.select()
		.from(ticketAssignmentHistory)
		.where(eq(ticketAssignmentHistory.ticketId, ticketId))
		.orderBy(asc(ticketAssignmentHistory.field));
}

test('assigning a ticket sets the assignee and owner and records both', async () => {
	const anna = await user();
	const ticket = await insertTicket();

	const outcome = await assignTicket(
		testDb,
		{ ticketId: ticket.id, expectedVersion: ticket.version, assigneeId: anna.id },
		actorFor(anna.id)
	);

	expect(outcome).toBe('assigned');
	expect(await stored(ticket.id)).toMatchObject({
		assigneeId: anna.id,
		nextStepOwnerId: anna.id,
		version: ticket.version + 1,
		status: 'new'
	});
	expect(await history(ticket.id)).toMatchObject([
		{
			field: 'assignee',
			previousUserId: null,
			newUserId: anna.id,
			actorType: 'user',
			actorId: anna.id
		},
		{ field: 'next_step_owner', previousUserId: null, newUserId: anna.id }
	]);
});

test('assigning does not clear attention', async () => {
	const anna = await user();
	const ticket = await insertTicket({ attentionSince: new Date(), attentionReason: 'new_ticket' });

	await assignTicket(
		testDb,
		{ ticketId: ticket.id, expectedVersion: ticket.version, assigneeId: anna.id },
		actorFor(anna.id)
	);

	expect(await stored(ticket.id)).toMatchObject({
		attentionReason: 'new_ticket',
		attentionSince: ticket.attentionSince
	});
});

test('reassigning keeps an owner who is a colleague', async () => {
	const anna = await user();
	const ben = await user();
	const carla = await user();
	const ticket = await insertTicket({
		status: 'waiting_internal',
		assigneeId: anna.id,
		nextStepOwnerId: carla.id
	});

	await assignTicket(
		testDb,
		{ ticketId: ticket.id, expectedVersion: ticket.version, assigneeId: ben.id },
		actorFor(anna.id)
	);

	expect(await stored(ticket.id)).toMatchObject({ assigneeId: ben.id, nextStepOwnerId: carla.id });
	expect(await history(ticket.id)).toHaveLength(1);
});

test('unassigning clears an owner who was the assignee', async () => {
	const anna = await user();
	const ticket = await insertTicket({ assigneeId: anna.id, nextStepOwnerId: anna.id });

	const outcome = await assignTicket(
		testDb,
		{ ticketId: ticket.id, expectedVersion: ticket.version, assigneeId: null },
		actorFor(anna.id)
	);

	expect(outcome).toBe('assigned');
	expect(await stored(ticket.id)).toMatchObject({ assigneeId: null, nextStepOwnerId: null });
});

test('the same assignment is unchanged and keeps the version', async () => {
	const anna = await user();
	const ticket = await insertTicket({ assigneeId: anna.id, nextStepOwnerId: anna.id });

	const outcome = await assignTicket(
		testDb,
		{
			ticketId: ticket.id,
			expectedVersion: ticket.version,
			assigneeId: anna.id,
			nextStepOwnerId: anna.id
		},
		actorFor(anna.id)
	);

	expect(outcome).toBe('unchanged');
	expect(await stored(ticket.id)).toEqual(ticket);
});

test('an inactive user cannot be assigned', async () => {
	const anna = await user();
	const inactive = await user({ active: false });
	const ticket = await insertTicket();

	const outcome = await assignTicket(
		testDb,
		{ ticketId: ticket.id, expectedVersion: ticket.version, assigneeId: inactive.id },
		actorFor(anna.id)
	);

	expect(outcome).toBe('inactive_user');
	expect(await stored(ticket.id)).toEqual(ticket);
	expect(await history(ticket.id)).toEqual([]);
});

test('an inactive assignee may keep the ticket while the owner changes', async () => {
	const anna = await user();
	const inactive = await user({ active: false });
	const ticket = await insertTicket({ assigneeId: inactive.id, nextStepOwnerId: inactive.id });

	const outcome = await assignTicket(
		testDb,
		{
			ticketId: ticket.id,
			expectedVersion: ticket.version,
			assigneeId: inactive.id,
			nextStepOwnerId: anna.id
		},
		actorFor(anna.id)
	);

	expect(outcome).toBe('assigned');
	expect(await stored(ticket.id)).toMatchObject({
		assigneeId: inactive.id,
		nextStepOwnerId: anna.id
	});
});

test('an outdated version cannot assign', async () => {
	const anna = await user();
	const ticket = await insertTicket();

	const outcome = await assignTicket(
		testDb,
		{ ticketId: ticket.id, expectedVersion: ticket.version - 1, assigneeId: anna.id },
		actorFor(anna.id)
	);

	expect(outcome).toBe('conflict');
	expect(await stored(ticket.id)).toEqual(ticket);
});

test('a closed ticket cannot be reassigned', async () => {
	const anna = await user();
	const ticket = await insertTicket({
		status: 'closed',
		closedAt: new Date(),
		resolution: 'duplicate'
	});

	const outcome = await assignTicket(
		testDb,
		{ ticketId: ticket.id, expectedVersion: ticket.version, assigneeId: anna.id },
		actorFor(anna.id)
	);

	expect(outcome).toBe('ticket_closed');
	expect(await stored(ticket.id)).toEqual(ticket);
});

test('the database rejects a next-step owner on a closed ticket', async () => {
	const anna = await user();

	await expect(
		testDb
			.insert(tickets)
			.values({
				...testCreator,
				subject: 'Constraint test: closed with owner',
				status: 'closed',
				closedAt: new Date(),
				resolution: 'duplicate',
				nextStepOwnerId: anna.id
			})
			.execute()
	).rejects.toMatchObject({
		cause: { code: '23514', constraint: 'tickets_next_step_owner_only_when_open' }
	});
});

test('moving an unassigned ticket out of new assigns the person who does it', async () => {
	const anna = await user();
	const ticket = await insertTicket();

	const outcome = await updateTicketStatus(
		testDb,
		{ ticketId: ticket.id, status: 'waiting_customer', expectedVersion: ticket.version },
		actorFor(anna.id)
	);

	expect(outcome).toBe('updated');
	expect(await stored(ticket.id)).toMatchObject({
		status: 'waiting_customer',
		assigneeId: anna.id,
		nextStepOwnerId: anna.id
	});
	expect(await history(ticket.id)).toMatchObject([
		{ field: 'assignee', newUserId: anna.id, actorId: anna.id },
		{ field: 'next_step_owner', newUserId: anna.id, actorId: anna.id }
	]);
});

test('a status change gives the new next step to the chosen owner', async () => {
	const anna = await user();
	const carla = await user();
	const ticket = await insertTicket({
		status: 'in_progress',
		assigneeId: anna.id,
		nextStepOwnerId: anna.id
	});

	await updateTicketStatus(
		testDb,
		{
			ticketId: ticket.id,
			status: 'waiting_internal',
			expectedVersion: ticket.version,
			nextStep: 'Wait for the spare part.',
			nextStepOwnerId: carla.id
		},
		actorFor(anna.id)
	);

	expect(await stored(ticket.id)).toMatchObject({ assigneeId: anna.id, nextStepOwnerId: carla.id });
});

test('a status change to an inactive owner is rejected', async () => {
	const anna = await user();
	const inactive = await user({ active: false });
	const ticket = await insertTicket({
		status: 'in_progress',
		assigneeId: anna.id,
		nextStepOwnerId: anna.id
	});

	const outcome = await updateTicketStatus(
		testDb,
		{
			ticketId: ticket.id,
			status: 'waiting_customer',
			expectedVersion: ticket.version,
			nextStepOwnerId: inactive.id
		},
		actorFor(anna.id)
	);

	expect(outcome).toBe('inactive_user');
	expect(await stored(ticket.id)).toEqual(ticket);
});

test('closing clears the next-step owner and keeps the assignee', async () => {
	const anna = await user();
	const ticket = await insertTicket({
		status: 'in_progress',
		assigneeId: anna.id,
		nextStepOwnerId: anna.id
	});

	const outcome = await updateTicketStatus(
		testDb,
		{
			ticketId: ticket.id,
			status: 'closed',
			expectedVersion: ticket.version,
			resolution: 'withdrawn'
		},
		actorFor(anna.id)
	);

	expect(outcome).toBe('updated');
	expect(await stored(ticket.id)).toMatchObject({
		status: 'closed',
		assigneeId: anna.id,
		nextStepOwnerId: null
	});
	expect(await history(ticket.id)).toMatchObject([
		{ field: 'next_step_owner', previousUserId: anna.id, newUserId: null }
	]);
});

test('a ticket created with an assignee gives them the triage step', async () => {
	const anna = await user();

	const created = await createTicket(
		testDb,
		{
			subject: 'Integration test: assigned on creation',
			priority: 'medium',
			source: 'manual',
			tags: [],
			assigneeId: anna.id
		},
		actorFor(anna.id)
	);

	if (created === 'inactive_user') {
		throw new Error('Test ticket was not created.');
	}

	ticketIds.push(created.id);

	expect(created).toMatchObject({ assigneeId: anna.id, nextStepOwnerId: anna.id });
	expect(await history(created.id)).toHaveLength(2);
});

test('a ticket cannot be created for an inactive assignee', async () => {
	const anna = await user();
	const inactive = await user({ active: false });

	const created = await createTicket(
		testDb,
		{
			subject: 'Integration test: inactive assignee',
			priority: 'medium',
			source: 'manual',
			tags: [],
			assigneeId: inactive.id
		},
		actorFor(anna.id)
	);

	expect(created).toBe('inactive_user');
});

test('a user who holds a ticket cannot be deleted', async () => {
	const anna = await user();
	await insertTicket({ assigneeId: anna.id });

	await expect(deleteTestUsers([anna.id])).rejects.toMatchObject({
		cause: { code: '23001' }
	});
});
