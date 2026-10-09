import { eq } from 'drizzle-orm';
import { afterAll, expect, test } from 'vitest';

import { tickets } from '../../src/lib/server/db/schema/tickets';
import { updateTicketStatus } from '../../src/lib/server/tickets/update-ticket-status';
import { testDb, testPool } from './helpers/db';
import { ticketStatusHistory } from '../../src/lib/server/db/schema/ticket-status-history';

afterAll(async () => {
	await testPool.end();
});

test('saving the current status does not change the ticket', async () => {
	const [created] = await testDb
		.insert(tickets)
		.values({
			subject: 'Integration test: unchanged status',
			status: 'new'
		})
		.returning();

	if (!created) {
		throw new Error('Test ticket was not created.');
	}

	try {
		const outcome = await updateTicketStatus(testDb, {
			ticketId: created.id,
			status: created.status,
			expectedVersion: created.version
		});

		expect(outcome).toBe('unchanged');

		const [stored] = await testDb.select().from(tickets).where(eq(tickets.id, created.id));

		expect(stored).toEqual(created);

		const history = await testDb
			.select()
			.from(ticketStatusHistory)
			.where(eq(ticketStatusHistory.ticketId, created.id));

		expect(history).toEqual([]);
	} finally {
		await testDb.delete(tickets).where(eq(tickets.id, created.id));
	}
});

test('resolving a ticket updates its status, version and timestamps', async () => {
	const originalTime = new Date('2020-01-01T00:00:00.000Z');

	const [created] = await testDb
		.insert(tickets)
		.values({
			subject: 'Integration test: resolve ticket',
			status: 'new',
			createdAt: originalTime,
			updatedAt: originalTime
		})
		.returning();

	if (!created) {
		throw new Error('Test ticket was not created.');
	}

	try {
		const outcome = await updateTicketStatus(testDb, {
			resolution: 'solved',
			resolutionSummary: 'Fixed in the test.',
			ticketId: created.id,
			status: 'resolved',
			expectedVersion: created.version
		});

		expect(outcome).toBe('updated');

		const [stored] = await testDb.select().from(tickets).where(eq(tickets.id, created.id));

		if (!stored) {
			throw new Error('Test ticket disappeared.');
		}

		const history = await testDb
			.select()
			.from(ticketStatusHistory)
			.where(eq(ticketStatusHistory.ticketId, created.id));

		expect(history).toHaveLength(1);
		expect(history[0]).toMatchObject({
			ticketId: created.id,
			previousStatus: 'new',
			newStatus: 'resolved',
			changedAt: stored.updatedAt
		});
	} finally {
		await testDb.delete(tickets).where(eq(tickets.id, created.id));
	}
});

test('an outdated version cannot overwrite a newer status change', async () => {
	const [created] = await testDb
		.insert(tickets)
		.values({
			subject: 'Integration test: outdated version',
			status: 'new'
		})
		.returning();

	if (!created) {
		throw new Error('Test ticket was not created.');
	}

	try {
		// The first tab saves using the original version.
		const firstOutcome = await updateTicketStatus(testDb, {
			ticketId: created.id,
			status: 'resolved',
			expectedVersion: created.version,
			resolution: 'solved',
			resolutionSummary: 'Fixed in the test.'
		});

		expect(firstOutcome).toBe('updated');

		const [afterFirstUpdate] = await testDb
			.select()
			.from(tickets)
			.where(eq(tickets.id, created.id));

		if (!afterFirstUpdate) {
			throw new Error('Test ticket disappeared.');
		}

		const historyBeforeConflict = await testDb
			.select()
			.from(ticketStatusHistory)
			.where(eq(ticketStatusHistory.ticketId, created.id));

		expect(historyBeforeConflict).toHaveLength(1);
		expect(historyBeforeConflict[0]).toMatchObject({
			ticketId: created.id,
			previousStatus: 'new',
			newStatus: 'resolved'
		});

		// The second tab still has the original, now outdated version.
		const secondOutcome = await updateTicketStatus(testDb, {
			ticketId: created.id,
			status: 'closed',
			expectedVersion: created.version
		});

		expect(secondOutcome).toBe('conflict');

		const [afterConflict] = await testDb.select().from(tickets).where(eq(tickets.id, created.id));

		expect(afterConflict).toEqual(afterFirstUpdate);

		const historyAfterConflict = await testDb
			.select()
			.from(ticketStatusHistory)
			.where(eq(ticketStatusHistory.ticketId, created.id));

		expect(historyAfterConflict).toEqual(historyBeforeConflict);
	} finally {
		await testDb.delete(tickets).where(eq(tickets.id, created.id));
	}
});

test('closing a resolved ticket preserves its resolution timestamp', async () => {
	const resolvedTime = new Date('2020-01-01T00:00:00.000Z');

	const [created] = await testDb
		.insert(tickets)
		.values({
			subject: 'Integration test: close resolved ticket',
			status: 'resolved',
			resolvedAt: resolvedTime,
			updatedAt: resolvedTime,
			firstResolvedAt: resolvedTime,
			resolution: 'solved',
			resolutionSummary: 'Fixed in the test.'
		})
		.returning();

	if (!created) {
		throw new Error('Test ticket was not created.');
	}

	try {
		const outcome = await updateTicketStatus(testDb, {
			ticketId: created.id,
			status: 'closed',
			expectedVersion: created.version
		});

		expect(outcome).toBe('updated');

		const [stored] = await testDb.select().from(tickets).where(eq(tickets.id, created.id));

		if (!stored) {
			throw new Error('Test ticket disappeared.');
		}

		expect(stored.status).toBe('closed');
		expect(stored.resolution).toBe('solved');
		expect(stored.resolutionSummary).toBe('Fixed in the test.');
		expect(stored.version).toBe(created.version + 1);
		expect(stored.resolvedAt).toEqual(created.resolvedAt);
		expect(stored.closedAt).toBeInstanceOf(Date);
		expect(stored.closedAt).toEqual(stored.updatedAt);
		expect(stored.updatedAt.getTime()).toBeGreaterThan(resolvedTime.getTime());
	} finally {
		await testDb.delete(tickets).where(eq(tickets.id, created.id));
	}
});

test('a closed ticket cannot change status', async () => {
	const resolvedTime = new Date('2020-01-01T00:00:00.000Z');
	const closedTime = new Date('2020-01-02T00:00:00.000Z');

	const [created] = await testDb
		.insert(tickets)
		.values({
			subject: 'Integration test: closed ticket is terminal',
			status: 'closed',
			createdAt: resolvedTime,
			resolvedAt: resolvedTime,
			firstResolvedAt: resolvedTime,
			closedAt: closedTime,
			updatedAt: closedTime,
			resolution: 'solved',
			resolutionSummary: 'Fixed in the test.'
		})
		.returning();

	if (!created) {
		throw new Error('Test ticket was not created.');
	}

	try {
		const outcome = await updateTicketStatus(testDb, {
			ticketId: created.id,
			status: 'in_progress',
			expectedVersion: created.version
		});

		expect(outcome).toBe('invalid_transition');

		const [stored] = await testDb.select().from(tickets).where(eq(tickets.id, created.id));

		expect(stored).toEqual(created);

		const history = await testDb
			.select()
			.from(ticketStatusHistory)
			.where(eq(ticketStatusHistory.ticketId, created.id));

		expect(history).toHaveLength(0);
	} finally {
		await testDb.delete(tickets).where(eq(tickets.id, created.id));
	}
});

test('reopening a resolved ticket clears its resolution timestamp', async () => {
	const resolvedTime = new Date('2020-01-01T00:00:00.000Z');

	const [created] = await testDb
		.insert(tickets)
		.values({
			subject: 'Integration test: reopen resolved ticket',
			status: 'resolved',
			createdAt: resolvedTime,
			resolvedAt: resolvedTime,
			updatedAt: resolvedTime,
			firstResolvedAt: resolvedTime,
			resolution: 'solved',
			resolutionSummary: 'Fixed in the test.'
		})
		.returning();

	if (!created) {
		throw new Error('Test ticket was not created.');
	}

	try {
		const outcome = await updateTicketStatus(testDb, {
			ticketId: created.id,
			status: 'in_progress',
			expectedVersion: created.version
		});

		expect(outcome).toBe('updated');

		const [stored] = await testDb.select().from(tickets).where(eq(tickets.id, created.id));

		if (!stored) {
			throw new Error('Test ticket disappeared.');
		}

		expect(stored.status).toBe('in_progress');
		expect(stored.version).toBe(created.version + 1);
		expect(stored.resolvedAt).toBeNull();
		expect(stored.resolution).toBeNull();
		expect(stored.resolutionSummary).toBeNull();
		expect(stored.closedAt).toBeNull();
		expect(stored.updatedAt.getTime()).toBeGreaterThan(resolvedTime.getTime());
		expect(stored.createdAt).toEqual(created.createdAt);

		const history = await testDb
			.select()
			.from(ticketStatusHistory)
			.where(eq(ticketStatusHistory.ticketId, created.id));

		expect(history).toHaveLength(1);
		expect(history[0]).toMatchObject({
			previousStatus: 'resolved',
			newStatus: 'in_progress'
		});
	} finally {
		await testDb.delete(tickets).where(eq(tickets.id, created.id));
	}
});

test('reopening counts the reopen and keeps the first resolution time', async () => {
	const [created] = await testDb
		.insert(tickets)
		.values({ subject: 'Integration test: reopen metrics', status: 'in_progress' })
		.returning();

	if (!created) {
		throw new Error('Test ticket was not created.');
	}

	try {
		const steps = ['resolved', 'in_progress', 'resolved'] as const;
		let version = created.version;
		let firstResolvedAt: Date | null = null;

		for (const status of steps) {
			const outcome = await updateTicketStatus(testDb, {
				ticketId: created.id,
				status,
				resolution: 'solved',
				resolutionSummary: 'Fixed in the test.',
				expectedVersion: version
			});

			expect(outcome).toBe('updated');
			version += 1;

			const [stored] = await testDb.select().from(tickets).where(eq(tickets.id, created.id));

			if (!stored) {
				throw new Error('Test ticket disappeared.');
			}

			firstResolvedAt ??= stored.firstResolvedAt;
			expect(stored.firstResolvedAt).toEqual(firstResolvedAt);
		}

		const [final] = await testDb.select().from(tickets).where(eq(tickets.id, created.id));

		expect(final?.reopenCount).toBe(1);
		expect(final?.firstResolvedAt).toBeInstanceOf(Date);
		expect(final?.resolvedAt?.getTime()).toBeGreaterThanOrEqual(firstResolvedAt!.getTime());
	} finally {
		await testDb.delete(tickets).where(eq(tickets.id, created.id));
	}
});

test.each([
	['resolving without a summary', 'resolved', 'solved'],
	['resolving without a resolution', 'resolved', undefined],
	['closing an unresolved ticket as solved', 'closed', 'solved'],
	['closing an unresolved ticket without a reason', 'closed', undefined]
] as const)('%s is rejected', async (_name, status, resolution) => {
	const [created] = await testDb
		.insert(tickets)
		.values({ subject: 'Integration test: resolution required', status: 'in_progress' })
		.returning();

	if (!created) {
		throw new Error('Test ticket was not created.');
	}

	try {
		const outcome = await updateTicketStatus(testDb, {
			ticketId: created.id,
			status,
			resolution,
			expectedVersion: created.version
		});

		expect(outcome).toBe('resolution_required');

		const [stored] = await testDb.select().from(tickets).where(eq(tickets.id, created.id));

		expect(stored).toEqual(created);
	} finally {
		await testDb.delete(tickets).where(eq(tickets.id, created.id));
	}
});

test('closing an unresolved ticket stores the reason', async () => {
	const [created] = await testDb
		.insert(tickets)
		.values({ subject: 'Integration test: close as duplicate', status: 'in_progress' })
		.returning();

	if (!created) {
		throw new Error('Test ticket was not created.');
	}

	try {
		const outcome = await updateTicketStatus(testDb, {
			ticketId: created.id,
			status: 'closed',
			resolution: 'duplicate',
			expectedVersion: created.version
		});

		expect(outcome).toBe('updated');

		const [stored] = await testDb.select().from(tickets).where(eq(tickets.id, created.id));

		expect(stored).toMatchObject({
			status: 'closed',
			resolution: 'duplicate',
			resolutionSummary: null,
			resolvedAt: null
		});
	} finally {
		await testDb.delete(tickets).where(eq(tickets.id, created.id));
	}
});
