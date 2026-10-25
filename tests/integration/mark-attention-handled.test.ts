import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, test } from 'vitest';

import type { Actor } from '../../src/lib/modules/tickets/ticket.types';
import { ticketAttentionEvents } from '../../src/lib/server/db/schema/ticket-attention-events';
import { tickets } from '../../src/lib/server/db/schema/tickets';
import { markAttentionHandled } from '../../src/lib/server/tickets/mark-attention-handled';
import {
	deleteTestTicket,
	testDb,
	testPool,
	testCreator,
	deleteTestUsers,
	insertTestUser
} from './helpers/db';

let user: Actor;
let testUserId: string;

beforeAll(async () => {
	testUserId = (await insertTestUser()).id;
	user = { type: 'user', id: testUserId };
});

afterAll(async () => {
	await deleteTestUsers([testUserId]);
	await testPool.end();
});

async function insertTicketWithAttention() {
	const [created] = await testDb
		.insert(tickets)
		.values({
			...testCreator,
			subject: 'Integration test: mark attention handled',
			status: 'new',
			attentionSince: new Date(),
			attentionReason: 'new_ticket'
		})
		.returning();

	if (!created) {
		throw new Error('Test ticket was not created.');
	}

	return created;
}

test('marking as handled clears attention and records it', async () => {
	const created = await insertTicketWithAttention();

	try {
		const outcome = await markAttentionHandled(
			testDb,
			{ ticketId: created.id, expectedVersion: created.version },
			user
		);

		expect(outcome).toBe('cleared');

		const [stored] = await testDb.select().from(tickets).where(eq(tickets.id, created.id));

		expect(stored).toMatchObject({
			status: 'new',
			attentionSince: null,
			attentionReason: null,
			version: created.version + 1
		});

		const events = await testDb
			.select()
			.from(ticketAttentionEvents)
			.where(eq(ticketAttentionEvents.ticketId, created.id));

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			eventType: 'cleared',
			reason: 'new_ticket',
			clearType: 'manual',
			actorType: 'user'
		});
	} finally {
		await deleteTestTicket(created.id);
	}
});

test('an outdated version cannot clear attention', async () => {
	const created = await insertTicketWithAttention();

	try {
		const outcome = await markAttentionHandled(
			testDb,
			{ ticketId: created.id, expectedVersion: created.version - 1 },
			user
		);

		expect(outcome).toBe('conflict');

		const [stored] = await testDb.select().from(tickets).where(eq(tickets.id, created.id));

		expect(stored).toEqual(created);

		const events = await testDb
			.select()
			.from(ticketAttentionEvents)
			.where(eq(ticketAttentionEvents.ticketId, created.id));

		expect(events).toHaveLength(0);
	} finally {
		await deleteTestTicket(created.id);
	}
});

test('a ticket without attention stays unchanged', async () => {
	const [created] = await testDb
		.insert(tickets)
		.values({
			...testCreator,
			subject: 'Integration test: nothing to handle',
			status: 'in_progress'
		})
		.returning();

	if (!created) {
		throw new Error('Test ticket was not created.');
	}

	try {
		const outcome = await markAttentionHandled(
			testDb,
			{ ticketId: created.id, expectedVersion: created.version },
			user
		);

		expect(outcome).toBe('unchanged');

		const [stored] = await testDb.select().from(tickets).where(eq(tickets.id, created.id));

		expect(stored).toEqual(created);
	} finally {
		await deleteTestTicket(created.id);
	}
});
