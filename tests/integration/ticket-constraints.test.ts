import { eq } from 'drizzle-orm';
import { afterAll, expect, test } from 'vitest';

import { tickets } from '../../src/lib/server/db/schema/tickets';
import { testDb, testPool } from './helpers/db';

const someTime = new Date('2020-01-01T00:00:00.000Z');

afterAll(async () => {
	await testPool.end();
});

test('rejects a closed ticket without closedAt', async () => {
	await expect(
		testDb
			.insert(tickets)
			.values({ subject: 'Constraint test: closed without closedAt', status: 'closed' })
			.execute()
	).rejects.toMatchObject({
		cause: { code: '23514', constraint: 'tickets_closed_at_matches_status' }
	});
});

test('rejects a new ticket with closedAt', async () => {
	await expect(
		testDb
			.insert(tickets)
			.values({ subject: 'Constraint test: new with closedAt', status: 'new', closedAt: someTime })
			.execute()
	).rejects.toMatchObject({
		cause: { code: '23514', constraint: 'tickets_closed_at_matches_status' }
	});
});

test('rejects a resolved ticket without firstResolvedAt', async () => {
	await expect(
		testDb
			.insert(tickets)
			.values({
				subject: 'Constraint test: resolved without firstResolvedAt',
				status: 'resolved',
				resolvedAt: someTime,
				resolution: 'solved',
				resolutionSummary: 'Summary'
			})
			.execute()
	).rejects.toMatchObject({
		cause: { code: '23514', constraint: 'tickets_resolved_at_has_first_resolved_at' }
	});
});

test('rejects a negative reopen count', async () => {
	await expect(
		testDb
			.insert(tickets)
			.values({ subject: 'Constraint test: negative reopen count', reopenCount: -1 })
			.execute()
	).rejects.toMatchObject({
		cause: { code: '23514', constraint: 'tickets_reopen_count_not_negative' }
	});
});

test('rejects a resolved ticket without resolvedAt', async () => {
	await expect(
		testDb
			.insert(tickets)
			.values({
				subject: 'Constraint test: resolved without resolvedAt',
				status: 'resolved',
				resolution: 'solved',
				resolutionSummary: 'Summary'
			})
			.execute()
	).rejects.toMatchObject({
		cause: { code: '23514', constraint: 'tickets_resolved_status_has_resolved_at' }
	});
});

test('rejects a new ticket with resolvedAt', async () => {
	await expect(
		testDb
			.insert(tickets)
			.values({
				subject: 'Constraint test: new with resolvedAt',
				status: 'new',
				resolvedAt: someTime,
				firstResolvedAt: someTime
			})
			.execute()
	).rejects.toMatchObject({
		cause: { code: '23514', constraint: 'tickets_resolved_at_only_when_resolved_or_closed' }
	});
});

test('rejects a new ticket with a resolution', async () => {
	await expect(
		testDb
			.insert(tickets)
			.values({ subject: 'Constraint test: new with resolution', resolution: 'solved' })
			.execute()
	).rejects.toMatchObject({
		cause: { code: '23514', constraint: 'tickets_resolution_only_when_resolved_or_closed' }
	});
});

test('rejects a resolved ticket without a summary', async () => {
	await expect(
		testDb
			.insert(tickets)
			.values({
				subject: 'Constraint test: resolved without summary',
				status: 'resolved',
				resolvedAt: someTime,
				firstResolvedAt: someTime,
				resolution: 'solved'
			})
			.execute()
	).rejects.toMatchObject({
		cause: { code: '23514', constraint: 'tickets_resolved_has_resolution_and_summary' }
	});
});

test('rejects a closed ticket without a resolution', async () => {
	await expect(
		testDb
			.insert(tickets)
			.values({
				subject: 'Constraint test: closed without resolution',
				status: 'closed',
				closedAt: someTime
			})
			.execute()
	).rejects.toMatchObject({
		cause: { code: '23514', constraint: 'tickets_closed_has_resolution' }
	});
});

test('rejects an unresolved closed ticket marked as solved', async () => {
	await expect(
		testDb
			.insert(tickets)
			.values({
				subject: 'Constraint test: closed unresolved as solved',
				status: 'closed',
				closedAt: someTime,
				resolution: 'solved'
			})
			.execute()
	).rejects.toMatchObject({
		cause: { code: '23514', constraint: 'tickets_closed_unresolved_not_solved' }
	});
});

test('allows closing a ticket that was never resolved', async () => {
	const [created] = await testDb
		.insert(tickets)
		.values({
			subject: 'Constraint test: closed without resolving',
			status: 'closed',
			closedAt: someTime,
			resolution: 'not_actionable'
		})
		.returning();

	if (!created) {
		throw new Error('Test ticket was not created.');
	}

	try {
		expect(created).toMatchObject({ status: 'closed', closedAt: someTime, resolvedAt: null });
	} finally {
		await testDb.delete(tickets).where(eq(tickets.id, created.id));
	}
});
