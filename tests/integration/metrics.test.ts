import { eq } from 'drizzle-orm';
import { afterAll, afterEach, expect, test } from 'vitest';

import type { Actor } from '../../src/lib/modules/tickets/ticket.types';
import { ticketAssignmentHistory } from '../../src/lib/server/db/schema/ticket-assignment-history';
import { ticketAttentionEvents } from '../../src/lib/server/db/schema/ticket-attention-events';
import { ticketNotes } from '../../src/lib/server/db/schema/ticket-notes';
import { ticketStatusHistory } from '../../src/lib/server/db/schema/ticket-status-history';
import { tickets } from '../../src/lib/server/db/schema/tickets';
import { computeMetrics } from '../../src/lib/server/metrics/compute-metrics';
import { createTicket } from '../../src/lib/server/tickets/create-ticket';
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

// Other test files write tickets at the same time, so these tests use a period nobody else uses.
const start = Date.UTC(2001, 2, 1);
const minute = 60_000;
const at = (minutes: number) => new Date(start + minutes * minute);
const period = { from: at(0), to: at(100_000) };

afterEach(async () => {
	for (const id of ticketIds.splice(0)) {
		await deleteTestTicket(id);
	}

	await deleteTestUsers(userIds.splice(0));
});

afterAll(async () => {
	await testPool.end();
});

async function agent() {
	const created = await insertTestUser();
	userIds.push(created.id);
	return created.id;
}

async function insertClosed(
	createdMinute: number,
	closedMinute: number,
	values: Partial<typeof tickets.$inferInsert> = {}
) {
	const [ticket] = await testDb
		.insert(tickets)
		.values({
			...testCreator,
			subject: 'Integration test: metrics',
			status: 'closed',
			createdAt: at(createdMinute),
			closedAt: at(closedMinute),
			updatedAt: at(closedMinute),
			resolution: 'withdrawn',
			nextStep: null,
			nextStepDue: null,
			...values
		})
		.returning();

	if (!ticket) {
		throw new Error('Test ticket was not created.');
	}

	ticketIds.push(ticket.id);
	return ticket;
}

function statusRow(ticketId: string, userId: string, minutes: number) {
	return testDb.insert(ticketStatusHistory).values({
		ticketId,
		previousStatus: 'new',
		newStatus: 'in_progress',
		changedAt: at(minutes),
		actorType: 'user',
		actorId: userId
	});
}

test('an empty period has no values', async () => {
	expect(
		await computeMetrics(testDb, { from: new Date('1999-01-01'), to: new Date('1999-01-02') })
	).toMatchObject({
		closedTickets: 0,
		actionsPerTicket: null,
		timeToFirstAction: null,
		timeToResolution: null,
		timeToClose: null,
		reopenRate: null
	});
});

test('the rows of one change count as one action', async () => {
	const anna = await agent();
	const ticket = await insertClosed(0, 60);

	await statusRow(ticket.id, anna, 10);
	await testDb.insert(ticketAssignmentHistory).values({
		ticketId: ticket.id,
		field: 'assignee',
		newUserId: anna,
		changedAt: at(10),
		actorType: 'user',
		actorId: anna
	});
	await testDb.insert(ticketAttentionEvents).values({
		ticketId: ticket.id,
		eventType: 'cleared',
		reason: 'new_ticket',
		clearType: 'status_change',
		occurredAt: at(10),
		actorType: 'user',
		actorId: anna
	});
	await testDb.insert(ticketNotes).values({
		ticketId: ticket.id,
		kind: 'phone_call',
		body: 'Called.',
		authorId: anna,
		createdAt: at(10)
	});

	const metrics = await computeMetrics(testDb, period);

	expect(metrics.actionsPerTicket).toEqual({ median: 1, average: 1 });
});

test('two people acting at the same moment are two actions', async () => {
	const anna = await agent();
	const ben = await agent();
	const ticket = await insertClosed(0, 60);

	await statusRow(ticket.id, anna, 10);
	await statusRow(ticket.id, ben, 10);

	expect((await computeMetrics(testDb, period)).actionsPerTicket).toEqual({
		median: 2,
		average: 2
	});
});

test('creating a ticket is an action of a person, not of the system', async () => {
	const anna = await agent();

	await insertClosed(0, 60);
	await insertClosed(0, 60, { createdByType: 'user', createdById: anna, createdByName: null });

	expect((await computeMetrics(testDb, period)).actionsPerTicket).toEqual({
		median: 0.5,
		average: 0.5
	});
});

test('changes by the system do not count', async () => {
	const ticket = await insertClosed(0, 60);

	await testDb.insert(ticketStatusHistory).values({
		ticketId: ticket.id,
		previousStatus: 'new',
		newStatus: 'in_progress',
		changedAt: at(10),
		actorType: 'system',
		actorName: 'email-sync'
	});

	const metrics = await computeMetrics(testDb, period);

	expect(metrics.actionsPerTicket).toEqual({ median: 0, average: 0 });
	expect(metrics.timeToFirstAction).toBeNull();
});

test('a note after closing does not count, the closing itself does', async () => {
	const anna = await agent();
	const ticket = await insertClosed(0, 60);

	await statusRow(ticket.id, anna, 60);
	await testDb.insert(ticketNotes).values({
		ticketId: ticket.id,
		kind: 'internal_note',
		body: 'Written after closing.',
		authorId: anna,
		createdAt: at(61)
	});

	expect((await computeMetrics(testDb, period)).actionsPerTicket).toEqual({
		median: 1,
		average: 1
	});
});

test('the period includes its start and excludes its end', async () => {
	await insertClosed(0, 0);
	await insertClosed(0, 100);

	expect((await computeMetrics(testDb, { from: at(0), to: at(100) })).closedTickets).toBe(1);
});

test('open tickets are left out of the closed-ticket metrics', async () => {
	const anna = await agent();
	const [open] = await testDb
		.insert(tickets)
		.values({ ...testCreator, subject: 'Integration test: metrics open', createdAt: at(0) })
		.returning();

	ticketIds.push(open!.id);
	await statusRow(open!.id, anna, 10);

	expect((await computeMetrics(testDb, period)).closedTickets).toBe(0);
});

test('durations and the reopen rate cover the closed tickets', async () => {
	const anna = await agent();
	const resolved = await insertClosed(0, 60, {
		resolvedAt: at(30),
		firstResolvedAt: at(30),
		resolution: 'solved',
		resolutionSummary: 'Fixed.',
		reopenCount: 1
	});
	const direct = await insertClosed(0, 180);

	await statusRow(resolved.id, anna, 10);
	await statusRow(direct.id, anna, 30);

	const metrics = await computeMetrics(testDb, period);

	expect(metrics).toMatchObject({
		closedTickets: 2,
		timeToFirstAction: { median: 20 * 60, average: 20 * 60 },
		// A ticket closed without being resolved has no time to resolution.
		timeToResolution: { median: 30 * 60, average: 30 * 60 },
		timeToClose: { median: 120 * 60, average: 120 * 60 },
		reopenRate: 0.5
	});
});

test('the overdue share looks at open tickets when the report runs', async () => {
	const [open] = await testDb
		.insert(tickets)
		.values({
			...testCreator,
			subject: 'Integration test: metrics overdue',
			nextStepDue: new Date()
		})
		.returning();

	ticketIds.push(open!.id);

	// Every open ticket has a due date, so these hold whatever other tests write.
	const empty = { from: new Date('1999-01-01'), to: new Date('1999-01-02') };

	expect((await computeMetrics(testDb, empty, new Date('1990-01-01'))).overdueShare).toBe(0);
	expect((await computeMetrics(testDb, empty, new Date('2999-01-01'))).overdueShare).toBe(1);
});

test('every service writes one change with one timestamp', async () => {
	const anna = await agent();
	const actor: Actor = { type: 'user', id: anna };
	const ticket = await createTicket(
		testDb,
		{ subject: 'Integration test: metrics', priority: 'medium', source: 'manual', tags: [] },
		actor
	);

	if (ticket === 'inactive_user') {
		throw new Error('Test ticket was not created.');
	}

	ticketIds.push(ticket.id);

	await updateTicketStatus(
		testDb,
		{
			ticketId: ticket.id,
			status: 'in_progress',
			expectedVersion: ticket.version,
			nextStep: 'Look into it',
			note: { kind: 'internal_note', body: 'Starting.' }
		},
		actor
	);

	const [status] = await testDb
		.select({ at: ticketStatusHistory.changedAt })
		.from(ticketStatusHistory)
		.where(eq(ticketStatusHistory.ticketId, ticket.id));
	const notes = await testDb
		.select({ at: ticketNotes.createdAt })
		.from(ticketNotes)
		.where(eq(ticketNotes.ticketId, ticket.id));
	const assignments = await testDb
		.select({ at: ticketAssignmentHistory.changedAt })
		.from(ticketAssignmentHistory)
		.where(eq(ticketAssignmentHistory.ticketId, ticket.id));
	const attention = await testDb
		.select({ at: ticketAttentionEvents.occurredAt, type: ticketAttentionEvents.eventType })
		.from(ticketAttentionEvents)
		.where(eq(ticketAttentionEvents.ticketId, ticket.id));

	const change = status!.at.getTime();
	const creation = ticket.createdAt.getTime();

	expect(attention.find((row) => row.type === 'raised')?.at.getTime()).toBe(creation);

	for (const row of [
		...notes,
		...assignments,
		...attention.filter((event) => event.type === 'cleared')
	]) {
		expect(row.at.getTime()).toBe(change);
	}
});
