import { randomUUID } from 'node:crypto';

import { afterAll, expect, test } from 'vitest';

import type { NewTicketRecord } from '../../src/lib/server/db/schema/tickets';
import { tickets } from '../../src/lib/server/db/schema/tickets';
import { listTickets } from '../../src/lib/server/tickets/list-tickets';
import { deleteTestTicket, testDb, testPool, testCreator } from './helpers/db';

afterAll(async () => {
	await testPool.end();
});

const hour = 60 * 60 * 1000;

async function insertTickets(
	marker: string,
	rows: Omit<NewTicketRecord, 'subject' | keyof typeof testCreator>[]
) {
	const created = [];

	for (const [index, row] of rows.entries()) {
		const [ticket] = await testDb
			.insert(tickets)
			.values({ ...testCreator, ...row, subject: `List test ${marker} ${index}` })
			.returning();

		if (!ticket) {
			throw new Error('Test ticket was not created.');
		}

		created.push(ticket);
	}

	return created;
}

test('the action view lists attention and overdue tickets, longest waiting first', async () => {
	const now = new Date();
	const marker = randomUUID();

	const [withAttention, overdue, onTrack] = await insertTickets(marker, [
		{
			status: 'new',
			attentionSince: new Date(now.getTime() - 2 * hour),
			attentionReason: 'new_ticket',
			nextStepDue: new Date(now.getTime() + hour)
		},
		{ status: 'in_progress', nextStepDue: new Date(now.getTime() - hour) },
		{ status: 'in_progress', nextStepDue: new Date(now.getTime() + 4 * hour) }
	]);

	try {
		const result = await listTickets(
			testDb,
			{ searchTerm: marker, view: 'action', page: 1, pageSize: 10 },
			now
		);

		expect(result.tickets.map((ticket) => ticket.id)).toEqual([withAttention!.id, overdue!.id]);
		expect(result.hasNextPage).toBe(false);
	} finally {
		for (const ticket of [withAttention, overdue, onTrack]) {
			if (ticket) {
				await deleteTestTicket(ticket.id);
			}
		}
	}
});

test('the overdue view leaves out tickets due later', async () => {
	const now = new Date();
	const marker = randomUUID();

	const [overdue, onTrack] = await insertTickets(marker, [
		{ status: 'waiting_customer', nextStepDue: new Date(now.getTime() - hour) },
		{ status: 'waiting_customer', nextStepDue: new Date(now.getTime() + hour) }
	]);

	try {
		const result = await listTickets(
			testDb,
			{ searchTerm: marker, view: 'overdue', page: 1, pageSize: 10 },
			now
		);

		expect(result.tickets.map((ticket) => ticket.id)).toEqual([overdue!.id]);
	} finally {
		for (const ticket of [overdue, onTrack]) {
			if (ticket) {
				await deleteTestTicket(ticket.id);
			}
		}
	}
});

test('the default view lists every ticket, newest first', async () => {
	const marker = randomUUID();

	const [older, newer] = await insertTickets(marker, [
		{ status: 'new', createdAt: new Date('2026-01-01T00:00:00Z') },
		{ status: 'new', createdAt: new Date('2026-01-02T00:00:00Z') }
	]);

	try {
		const result = await listTickets(testDb, {
			searchTerm: marker,
			view: 'all',
			page: 1,
			pageSize: 10
		});

		expect(result.tickets.map((ticket) => ticket.id)).toEqual([newer!.id, older!.id]);
	} finally {
		for (const ticket of [older, newer]) {
			if (ticket) {
				await deleteTestTicket(ticket.id);
			}
		}
	}
});
