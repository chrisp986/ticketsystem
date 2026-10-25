import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, test } from 'vitest';

import type { Actor } from '../../src/lib/modules/tickets/ticket.types';
import { users } from '../../src/lib/server/db/schema/users';
import { ticketAssignmentHistory } from '../../src/lib/server/db/schema/ticket-assignment-history';
import { ticketAttentionEvents } from '../../src/lib/server/db/schema/ticket-attention-events';
import { ticketStatusHistory } from '../../src/lib/server/db/schema/ticket-status-history';
import { tickets } from '../../src/lib/server/db/schema/tickets';
import { createTicket } from '../../src/lib/server/tickets/create-ticket';
import { markAttentionHandled } from '../../src/lib/server/tickets/mark-attention-handled';
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

async function user() {
	const created = await insertTestUser();
	userIds.push(created.id);
	return created;
}

async function insertTicket(values: Partial<typeof tickets.$inferInsert> = {}) {
	const [created] = await testDb
		.insert(tickets)
		.values({ ...testCreator, subject: 'Integration test: actors', status: 'new', ...values })
		.returning();

	if (!created) {
		throw new Error('Test ticket was not created.');
	}

	ticketIds.push(created.id);
	return created;
}

async function create(actor: Actor, assigneeId?: string) {
	const created = await createTicket(
		testDb,
		{
			subject: 'Integration test: actors',
			priority: 'medium',
			source: 'manual',
			tags: [],
			assigneeId
		},
		actor
	);

	if (created === 'inactive_user') {
		throw new Error('Test ticket was not created.');
	}

	ticketIds.push(created.id);
	return created;
}

/**
 * Actor columns that ADR 0009 forbids. `anna` stands for an existing user's ID.
 */
const invalidActors = [
	['a user without an ID', { type: 'user', id: null, name: null }],
	['a user with a name', { type: 'user', id: 'anna', name: 'anna' }],
	['the system without a name', { type: 'system', id: null, name: null }],
	['the system with a user ID', { type: 'system', id: 'anna', name: 'email-sync' }],
	['a blank name', { type: 'system', id: null, name: '  ' }],
	['an upper-case name', { type: 'ai', id: null, name: 'Email-Sync' }],
	['a name over 100 characters', { type: 'ai', id: null, name: 'a'.repeat(101) }]
] as const;

type InvalidActor = (typeof invalidActors)[number][1];

function columns(actor: InvalidActor, annaId: string) {
	return { type: actor.type, id: actor.id === 'anna' ? annaId : null, name: actor.name };
}

describe('the database enforces valid actors', () => {
	test.each(invalidActors)('tickets reject %s as creator', async (_, invalid) => {
		const anna = await user();
		const actor = columns(invalid, anna.id);

		await expect(
			testDb
				.insert(tickets)
				.values({
					subject: 'Constraint test: creator',
					createdByType: actor.type,
					createdById: actor.id,
					createdByName: actor.name
				})
				.execute()
		).rejects.toMatchObject({
			cause: { code: '23514', constraint: 'tickets_created_by_valid' }
		});
	});

	test.each(invalidActors)('history tables reject %s', async (_, invalid) => {
		const anna = await user();
		const ticket = await insertTicket();
		const actor = columns(invalid, anna.id);
		const fields = { actorType: actor.type, actorId: actor.id, actorName: actor.name };

		await expect(
			testDb
				.insert(ticketStatusHistory)
				.values({ ticketId: ticket.id, previousStatus: 'new', newStatus: 'in_progress', ...fields })
				.execute()
		).rejects.toMatchObject({
			cause: { code: '23514', constraint: 'ticket_status_history_actor_valid' }
		});

		await expect(
			testDb
				.insert(ticketAttentionEvents)
				.values({ ticketId: ticket.id, eventType: 'raised', reason: 'new_ticket', ...fields })
				.execute()
		).rejects.toMatchObject({
			cause: { code: '23514', constraint: 'ticket_attention_events_actor_valid' }
		});

		await expect(
			testDb
				.insert(ticketAssignmentHistory)
				.values({ ticketId: ticket.id, field: 'assignee', newUserId: anna.id, ...fields })
				.execute()
		).rejects.toMatchObject({
			cause: { code: '23514', constraint: 'ticket_assignment_history_actor_valid' }
		});
	});

	test('an actor ID must belong to a user', async () => {
		const ticket = await insertTicket();

		await expect(
			testDb
				.insert(ticketStatusHistory)
				.values({
					ticketId: ticket.id,
					previousStatus: 'new',
					newStatus: 'in_progress',
					actorType: 'user',
					actorId: crypto.randomUUID()
				})
				.execute()
		).rejects.toMatchObject({
			cause: { code: '23503', constraint: 'ticket_status_history_actor_id_users_id_fk' }
		});
	});

	test('a user who acted cannot be deleted, only deactivated', async () => {
		const anna = await user();
		const ticket = await create({ type: 'user', id: anna.id });

		await expect(testDb.delete(users).where(eq(users.id, anna.id)).execute()).rejects.toMatchObject(
			{ cause: { code: '23001' } }
		);

		await testDb.update(users).set({ active: false }).where(eq(users.id, anna.id));

		const [stored] = await testDb.select().from(tickets).where(eq(tickets.id, ticket.id));
		expect(stored).toMatchObject({ createdByType: 'user', createdById: anna.id });
	});
});

describe('services record the actor', () => {
	test('a ticket records the user who created it', async () => {
		const anna = await user();
		const ticket = await create({ type: 'user', id: anna.id });

		expect(ticket).toMatchObject({
			createdByType: 'user',
			createdById: anna.id,
			createdByName: null
		});
	});

	test('a ticket records the system component that created it', async () => {
		const ticket = await create({ type: 'system', name: 'email-sync' });

		expect(ticket).toMatchObject({
			createdByType: 'system',
			createdById: null,
			createdByName: 'email-sync'
		});

		const [event] = await testDb
			.select()
			.from(ticketAttentionEvents)
			.where(eq(ticketAttentionEvents.ticketId, ticket.id));

		expect(event).toMatchObject({ actorType: 'system', actorId: null, actorName: 'email-sync' });
	});

	test('a system status change records the component by name', async () => {
		const ticket = await insertTicket({ status: 'waiting_customer' });

		const outcome = await updateTicketStatus(
			testDb,
			{
				ticketId: ticket.id,
				status: 'in_progress',
				expectedVersion: ticket.version,
				nextStep: 'Read the reply'
			},
			{ type: 'system', name: 'email-sync' }
		);

		expect(outcome).toBe('updated');

		const history = await testDb
			.select()
			.from(ticketStatusHistory)
			.where(eq(ticketStatusHistory.ticketId, ticket.id));

		expect(history).toMatchObject([
			{ actorType: 'system', actorId: null, actorName: 'email-sync' }
		]);
	});
});

describe('ticket timeline', () => {
	test('lists creation, status, assignment and attention changes newest first, with actors', async () => {
		const anna = await user();
		const ben = await user();
		const ticket = await create({ type: 'user', id: anna.id }, anna.id);

		await new Promise((resolve) => setTimeout(resolve, 5));

		const outcome = await updateTicketStatus(
			testDb,
			{
				ticketId: ticket.id,
				status: 'waiting_internal',
				expectedVersion: ticket.version,
				nextStep: 'Order the part',
				nextStepDue: new Date(Date.now() + 86_400_000),
				nextStepOwnerId: ben.id
			},
			{ type: 'user', id: ben.id }
		);

		expect(outcome).toBe('updated');

		await testDb.update(users).set({ active: false }).where(eq(users.id, anna.id));

		const timeline = await loadTicketTimeline(testDb, ticket);

		expect(timeline.map((entry) => entry.kind)).toEqual([
			'attention',
			'assignment',
			'status',
			'attention',
			'assignment',
			'assignment',
			'created'
		]);

		const benActor = { type: 'user', id: ben.id };
		const annaActor = { type: 'user', id: anna.id };

		expect(timeline).toMatchObject([
			{ kind: 'attention', eventType: 'cleared', clearType: 'status_change', actor: benActor },
			{
				kind: 'assignment',
				field: 'next_step_owner',
				previousUserId: anna.id,
				newUserId: ben.id,
				actor: benActor
			},
			{ kind: 'status', previousStatus: 'new', newStatus: 'waiting_internal', actor: benActor },
			{ kind: 'attention', eventType: 'raised', reason: 'new_ticket', actor: annaActor },
			{ kind: 'assignment', actor: annaActor },
			{ kind: 'assignment', actor: annaActor },
			{ kind: 'created', id: ticket.id, actor: annaActor }
		]);
	});

	test('shows a system actor by name', async () => {
		const ticket = await create({ type: 'system', name: 'email-sync' });
		const anna = await user();

		const [stored] = await testDb.select().from(tickets).where(eq(tickets.id, ticket.id));

		await markAttentionHandled(
			testDb,
			{ ticketId: ticket.id, expectedVersion: stored!.version },
			{ type: 'user', id: anna.id }
		);

		const timeline = await loadTicketTimeline(testDb, ticket);

		expect(timeline.map((entry) => entry.actor)).toEqual([
			{ type: 'user', id: anna.id },
			{ type: 'system', name: 'email-sync' },
			{ type: 'system', name: 'email-sync' }
		]);
	});
});
