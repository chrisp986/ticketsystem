import { eq } from 'drizzle-orm';
import { afterAll, expect, test } from 'vitest';

import { tickets } from '../../src/lib/server/db/schema/tickets';
import { createTicket } from '../../src/lib/server/tickets/create-ticket';
import type { Actor } from '../../src/lib/modules/tickets/ticket.types';
import { ticketAttentionEvents } from '../../src/lib/server/db/schema/ticket-attention-events';
import { deleteTestTicket, testDb, testPool } from './helpers/db';

const user: Actor = { type: 'user' };

afterAll(async () => {
	await testPool.end();
});

test('creates a ticket with the expected defaults', async () => {
	const created = await createTicket(
		testDb,
		{
			subject: 'Integration test: create ticket',
			priority: 'medium',
			source: 'manual',
			tags: []
		},
		user
	);

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
		await deleteTestTicket(created.id);
	}
});

test('creates a ticket not with the defaults', async () => {
	const created = await createTicket(
		testDb,
		{
			subject: 'Integration test: create ticket with non default values',
			priority: 'high',
			source: 'email',
			tags: ['conveyor', 'technical_support']
		},
		user
	);

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
		await deleteTestTicket(created.id);
	}
});

test('a new ticket starts with triage due in one business hour', async () => {
	const fridayMorning = new Date('2026-10-09T10:00:00+02:00');

	const created = await createTicket(
		testDb,
		{
			subject: 'Integration test: next step on creation',
			priority: 'medium',
			source: 'manual',
			tags: []
		},
		user,
		fridayMorning
	);

	try {
		expect(created.nextStep).toBe('Triage the request');
		expect(created.nextStepDue?.toISOString()).toBe('2026-10-09T09:00:00.000Z');

		const [stored] = await testDb.select().from(tickets).where(eq(tickets.id, created.id));

		expect(stored).toEqual(created);
	} finally {
		await deleteTestTicket(created.id);
	}
});

test('a new ticket needs attention for triage', async () => {
	const now = new Date('2026-10-09T10:00:00+02:00');

	const created = await createTicket(
		testDb,
		{
			subject: 'Integration test: attention on creation',
			priority: 'medium',
			source: 'manual',
			tags: []
		},
		user,
		now
	);

	try {
		expect(created).toMatchObject({ attentionSince: now, attentionReason: 'new_ticket' });

		const events = await testDb
			.select()
			.from(ticketAttentionEvents)
			.where(eq(ticketAttentionEvents.ticketId, created.id));

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			eventType: 'raised',
			reason: 'new_ticket',
			clearType: null,
			actorType: 'user'
		});
	} finally {
		await deleteTestTicket(created.id);
	}
});
