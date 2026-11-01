import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { createDb } from '../../src/lib/server/db/create-db';
import { jobs } from '../../src/lib/server/db/schema/jobs';
import { ticketAttentionEvents } from '../../src/lib/server/db/schema/ticket-attention-events';
import { tickets } from '../../src/lib/server/db/schema/tickets';
import { logger } from '../../src/lib/server/logger';
import { computeMetrics } from '../../src/lib/server/metrics/compute-metrics';
import { markAttentionHandled } from '../../src/lib/server/tickets/mark-attention-handled';
import { raiseOverdueAttention } from '../../src/lib/server/tickets/raise-overdue-attention';
import { loadTicketTimeline } from '../../src/lib/server/tickets/ticket-timeline';
import { jobHandlers } from '../../src/worker/handlers';
import { recurringJobs } from '../../src/worker/recurring-jobs';
import { startWorker } from '../../src/worker/worker';
import { deleteTestTicket, testCreator, testDb, testPool } from './helpers/db';
import { getTestDatabaseUrl } from './helpers/test-database-url';

// A period before every other ticket, whose due dates this check must not reach.
const start = Date.UTC(2001, 5, 1);
const minute = 60_000;
const at = (minutes: number) => new Date(start + minutes * minute);

const concurrent = createDb(getTestDatabaseUrl(), 5);

const ticketIds: string[] = [];

afterEach(async () => {
	for (const id of ticketIds.splice(0)) {
		await deleteTestTicket(id);
	}
});

afterAll(async () => {
	await concurrent.pool.end();
	await testPool.end();
});

async function insertTicket(values: Partial<typeof tickets.$inferInsert> = {}) {
	const [ticket] = await testDb
		.insert(tickets)
		.values({
			...testCreator,
			subject: 'Integration test: overdue',
			status: 'in_progress',
			nextStep: 'Call back',
			nextStepDue: at(10),
			createdAt: at(0),
			updatedAt: at(0),
			...values
		})
		.returning();

	if (!ticket) {
		throw new Error('Test ticket was not created.');
	}

	ticketIds.push(ticket.id);
	return ticket;
}

async function storedTicket(id: string) {
	const [ticket] = await testDb.select().from(tickets).where(eq(tickets.id, id));

	if (!ticket) {
		throw new Error('Test ticket was not found.');
	}

	return ticket;
}

async function eventsOf(ticketId: string) {
	return testDb
		.select()
		.from(ticketAttentionEvents)
		.where(eq(ticketAttentionEvents.ticketId, ticketId));
}

describe('raising attention', () => {
	test('flags an overdue ticket with a system event and a new version', async () => {
		const ticket = await insertTicket();

		expect(await raiseOverdueAttention(testDb, at(20))).toBe(1);
		expect(await storedTicket(ticket.id)).toMatchObject({
			attentionSince: at(20),
			attentionReason: 'next_step_overdue',
			version: ticket.version + 1,
			updatedAt: at(20),
			status: 'in_progress'
		});
		expect(await eventsOf(ticket.id)).toMatchObject([
			{
				eventType: 'raised',
				reason: 'next_step_overdue',
				actorType: 'system',
				actorName: 'overdue-job',
				actorId: null,
				occurredAt: at(20)
			}
		]);
	});

	test('skips a next step that is not yet overdue', async () => {
		const ticket = await insertTicket({ nextStepDue: at(20) });

		expect(await raiseOverdueAttention(testDb, at(20))).toBe(0);
		expect(await storedTicket(ticket.id)).toMatchObject({ attentionSince: null });
	});

	test('skips a closed ticket', async () => {
		const ticket = await insertTicket({
			status: 'closed',
			closedAt: at(5),
			resolution: 'withdrawn',
			nextStep: null,
			nextStepDue: null
		});

		expect(await raiseOverdueAttention(testDb, at(20))).toBe(0);
		expect(await eventsOf(ticket.id)).toEqual([]);
	});

	test('keeps existing attention as it is', async () => {
		const ticket = await insertTicket({
			attentionSince: at(5),
			attentionReason: 'customer_reply'
		});

		expect(await raiseOverdueAttention(testDb, at(20))).toBe(0);
		expect(await storedTicket(ticket.id)).toMatchObject({
			attentionSince: at(5),
			attentionReason: 'customer_reply',
			version: ticket.version
		});
		expect(await eventsOf(ticket.id)).toEqual([]);
	});

	test('raises once existing attention is cleared, if it never raised for this due date', async () => {
		const ticket = await insertTicket({
			attentionSince: at(5),
			attentionReason: 'customer_reply'
		});

		await markAttentionHandled(
			testDb,
			{ ticketId: ticket.id, expectedVersion: ticket.version },
			{ type: 'system', name: 'integration-test' }
		);

		expect(await raiseOverdueAttention(testDb, at(20))).toBe(1);
		expect(await storedTicket(ticket.id)).toMatchObject({
			attentionReason: 'next_step_overdue'
		});
	});
});

describe('raising only once per due date', () => {
	async function raisedAndHandled() {
		const ticket = await insertTicket();

		await raiseOverdueAttention(testDb, at(20));

		const raised = await storedTicket(ticket.id);

		await markAttentionHandled(
			testDb,
			{ ticketId: ticket.id, expectedVersion: raised.version },
			{ type: 'system', name: 'integration-test' }
		);

		return ticket;
	}

	test('does not raise again after it was marked as handled', async () => {
		const ticket = await raisedAndHandled();

		expect(await raiseOverdueAttention(testDb, at(30))).toBe(0);
		expect(await storedTicket(ticket.id)).toMatchObject({ attentionSince: null });
	});

	test('raises again when a new due date passes', async () => {
		const ticket = await raisedAndHandled();

		await testDb
			.update(tickets)
			.set({ nextStepDue: at(40) })
			.where(eq(tickets.id, ticket.id));

		expect(await raiseOverdueAttention(testDb, at(30))).toBe(0);
		expect(await raiseOverdueAttention(testDb, at(50))).toBe(1);
		expect(await storedTicket(ticket.id)).toMatchObject({ attentionSince: at(50) });
	});

	test('raises each ticket once when runs overlap', async () => {
		const inserted = await Promise.all(Array.from({ length: 10 }, () => insertTicket()));

		const counts = await Promise.all(
			Array.from({ length: 5 }, () => raiseOverdueAttention(concurrent.db, at(20)))
		);

		expect(counts.reduce((sum, count) => sum + count, 0)).toBe(10);

		for (const ticket of inserted) {
			expect(await eventsOf(ticket.id)).toHaveLength(1);
		}
	});
});

describe('in the system', () => {
	beforeEach(async () => {
		await testDb.delete(jobs);
	});

	afterEach(async () => {
		await testDb.delete(jobs);
		vi.restoreAllMocks();
	});

	test('a real worker run flags an overdue ticket, shown in the timeline', async () => {
		vi.spyOn(logger, 'info').mockImplementation(() => {});

		const ticket = await insertTicket();
		const worker = startWorker({
			db: concurrent.db,
			workerId: 'overdue-test-worker',
			handlers: jobHandlers,
			concurrency: { default: 1, ai: 0 },
			pollIntervalMs: 10,
			lockDurationMs: 60_000,
			renewIntervalMs: 20_000,
			recoveryIntervalMs: 60_000,
			recurringJobs
		});

		try {
			await vi.waitFor(async () =>
				expect(await storedTicket(ticket.id)).toMatchObject({
					attentionReason: 'next_step_overdue'
				})
			);
		} finally {
			await worker.stop(5000);
		}

		const [run] = await testDb.select().from(jobs);

		expect(run).toMatchObject({ type: 'overdue_next_steps', status: 'succeeded', maxAttempts: 1 });
		expect(logger.info).toHaveBeenCalledWith(
			'overdue next steps checked',
			expect.objectContaining({ raised: expect.any(Number) })
		);

		const timeline = await loadTicketTimeline(testDb, await storedTicket(ticket.id));

		expect(timeline.find((entry) => entry.kind === 'attention')).toMatchObject({
			eventType: 'raised',
			reason: 'next_step_overdue',
			actor: { type: 'system', name: 'overdue-job' }
		});
	});

	test('the raised attention does not count as an action in the metrics', async () => {
		const ticket = await insertTicket();
		const period = { from: at(0), to: at(100) };

		await raiseOverdueAttention(testDb, at(20));
		await testDb
			.update(tickets)
			.set({
				status: 'closed',
				closedAt: at(30),
				resolution: 'withdrawn',
				nextStep: null,
				nextStepDue: null,
				attentionSince: null,
				attentionReason: null
			})
			.where(eq(tickets.id, ticket.id));

		const metrics = await computeMetrics(testDb, period, at(100));

		expect(metrics.closedTickets).toBe(1);
		expect(metrics.actionsPerTicket).toMatchObject({ average: 0 });
	});
});
