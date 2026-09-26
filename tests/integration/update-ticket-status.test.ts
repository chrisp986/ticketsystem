import { eq } from 'drizzle-orm';
import { afterAll, expect, test } from 'vitest';

import { tickets } from '../../src/lib/server/db/schema/tickets';
import { updateTicketStatus } from '../../src/lib/server/tickets/update-ticket-status';
import { testDb, testPool } from './helpers/db';

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
			ticketId: created.id,
			status: 'resolved',
			expectedVersion: created.version
		});

		expect(outcome).toBe('updated');

		const [stored] = await testDb.select().from(tickets).where(eq(tickets.id, created.id));

		if (!stored) {
			throw new Error('Test ticket disappeared.');
		}

		expect(stored.status).toBe('resolved');
		expect(stored.version).toBe(created.version + 1);
		expect(stored.resolvedAt).toBeInstanceOf(Date);
		expect(stored.updatedAt.getTime()).toBeGreaterThan(originalTime.getTime());
		expect(stored.resolvedAt).toEqual(stored.updatedAt);
		expect(stored.closedAt).toBeNull();
		expect(stored.createdAt).toEqual(created.createdAt);
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
			expectedVersion: created.version
		});

		expect(firstOutcome).toBe('updated');

		const [afterFirstUpdate] = await testDb
			.select()
			.from(tickets)
			.where(eq(tickets.id, created.id));

		if (!afterFirstUpdate) {
			throw new Error('Test ticket disappeared.');
		}

		// The second tab still has the original, now outdated version.
		const secondOutcome = await updateTicketStatus(testDb, {
			ticketId: created.id,
			status: 'closed',
			expectedVersion: created.version
		});

		expect(secondOutcome).toBe('conflict');

		const [afterConflict] = await testDb.select().from(tickets).where(eq(tickets.id, created.id));

		expect(afterConflict).toEqual(afterFirstUpdate);
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
			updatedAt: resolvedTime
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
		expect(stored.version).toBe(created.version + 1);
		expect(stored.resolvedAt).toEqual(created.resolvedAt);
		expect(stored.closedAt).toBeInstanceOf(Date);
		expect(stored.closedAt).toEqual(stored.updatedAt);
		expect(stored.updatedAt.getTime()).toBeGreaterThan(resolvedTime.getTime());
	} finally {
		await testDb.delete(tickets).where(eq(tickets.id, created.id));
	}
});

test('reopening a closed ticket clears its lifecycle timestamps', async () => {
	const resolvedTime = new Date('2020-01-01T00:00:00.000Z');
	const closedTime = new Date('2020-01-02T00:00:00.000Z');

	const [created] = await testDb
		.insert(tickets)
		.values({
			subject: 'Integration test: reopen closed ticket',
			status: 'closed',
			createdAt: resolvedTime,
			resolvedAt: resolvedTime,
			closedAt: closedTime,
			updatedAt: closedTime
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
		expect(stored.closedAt).toBeNull();
		expect(stored.updatedAt.getTime()).toBeGreaterThan(closedTime.getTime());
		expect(stored.createdAt).toEqual(created.createdAt);
	} finally {
		await testDb.delete(tickets).where(eq(tickets.id, created.id));
	}
});
