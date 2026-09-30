import { eq } from 'drizzle-orm';
import { afterAll, expect, test } from 'vitest';

import { tickets } from '../../src/lib/server/db/schema/tickets';
import { createTicket } from '../../src/lib/server/tickets/create-ticket';
import { testDb, testPool } from './helpers/db';

afterAll(async () => {
	await testPool.end();
});

test('creates a ticket with the expected defaults', async () => {
	const created = await createTicket(testDb, {
		subject: 'Integration test: create ticket',
		priority: 'medium',
		source: 'manual',
		tags: []
	});

	try {
		expect(created).toMatchObject({
			subject: 'Integration test: create ticket',
			description: null,
			status: 'new',
			priority: 'medium',
			source: 'manual',
			tags: [],
			version: 1,
			resolvedAt: null,
			closedAt: null
		});
		expect(created.id).toEqual(expect.any(String));
		expect(created.ticketNumber).toBeGreaterThan(0);
		expect(created.createdAt).toBeInstanceOf(Date);
		expect(created.updatedAt).toBeInstanceOf(Date);

		const [stored] = await testDb.select().from(tickets).where(eq(tickets.id, created.id));

		expect(stored).toEqual(created);
	} finally {
		await testDb.delete(tickets).where(eq(tickets.id, created.id));
	}
});

test('creates a ticket not with the defaults', async () => {
	const created = await createTicket(testDb, {
		subject: 'Integration test: create ticket with non default values',
		priority: 'high',
		source: 'email',
		tags: ['conveyor', 'technical_support']
	});

	try {
		expect(created).toMatchObject({
			subject: 'Integration test: create ticket with non default values',
			description: null,
			status: 'new',
			priority: 'high',
			source: 'email',
			tags: ['conveyor', 'technical_support'],
			version: 1,
			resolvedAt: null,
			closedAt: null
		});
		expect(created.id).toEqual(expect.any(String));
		expect(created.ticketNumber).toBeGreaterThan(0);
		expect(created.createdAt).toBeInstanceOf(Date);
		expect(created.updatedAt).toBeInstanceOf(Date);

		const [stored] = await testDb.select().from(tickets).where(eq(tickets.id, created.id));

		expect(stored).toEqual(created);
	} finally {
		await testDb.delete(tickets).where(eq(tickets.id, created.id));
	}
});
