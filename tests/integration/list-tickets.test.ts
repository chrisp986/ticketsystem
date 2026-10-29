import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, test } from 'vitest';

import type { NewTicketRecord } from '../../src/lib/server/db/schema/tickets';
import { tickets } from '../../src/lib/server/db/schema/tickets';
import { countTicketViews, listTickets } from '../../src/lib/server/tickets/list-tickets';
import {
	deleteTestTicket,
	deleteTestUsers,
	insertTestUser,
	testDb,
	testPool,
	testCreator
} from './helpers/db';

afterAll(async () => {
	await testPool.end();
});

const hour = 60 * 60 * 1000;

// The views that do not depend on the user ignore it.
const nobody = randomUUID();

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
			{ searchTerm: marker, view: 'action', currentUserId: nobody, page: 1, pageSize: 10 },
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
			{ searchTerm: marker, view: 'overdue', currentUserId: nobody, page: 1, pageSize: 10 },
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
			currentUserId: nobody,
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

describe('personal views', () => {
	async function setUp() {
		const anna = await insertTestUser({ name: 'Anna' });
		const ben = await insertTestUser({ name: 'Ben' });
		const now = new Date();
		const marker = randomUUID();
		const early = new Date(now.getTime() - 3 * hour);
		const late = new Date(now.getTime() - hour);
		const later = new Date(now.getTime() + hour);
		const closedAt = new Date(now.getTime() - 2 * hour);

		const [
			annaOverdue,
			annaOnTrack,
			benOwnsAnnasNextStep,
			annaOwnsBensNextStep,
			annaAssignedNoOwner,
			unassigned,
			annaClosed
		] = await insertTickets(marker, [
			{
				status: 'in_progress',
				assigneeId: anna.id,
				nextStepOwnerId: anna.id,
				nextStepDue: early
			},
			{
				status: 'in_progress',
				assigneeId: anna.id,
				nextStepOwnerId: anna.id,
				nextStepDue: later
			},
			{
				status: 'waiting_internal',
				assigneeId: anna.id,
				nextStepOwnerId: ben.id,
				nextStepDue: late
			},
			{
				status: 'waiting_internal',
				assigneeId: ben.id,
				nextStepOwnerId: anna.id,
				nextStepDue: late
			},
			{ status: 'in_progress', assigneeId: anna.id, nextStepOwnerId: null, nextStepDue: late },
			{ status: 'new', nextStepDue: later },
			{
				status: 'closed',
				assigneeId: anna.id,
				closedAt,
				updatedAt: closedAt,
				resolution: 'withdrawn',
				nextStep: null,
				nextStepDue: null
			}
		]);

		const ids = {
			annaOverdue: annaOverdue!.id,
			annaOnTrack: annaOnTrack!.id,
			benOwnsAnnasNextStep: benOwnsAnnasNextStep!.id,
			annaOwnsBensNextStep: annaOwnsBensNextStep!.id,
			annaAssignedNoOwner: annaAssignedNoOwner!.id,
			unassigned: unassigned!.id,
			annaClosed: annaClosed!.id
		};

		async function list(view: 'mine' | 'my_overdue' | 'unassigned', userId: string) {
			const result = await listTickets(
				testDb,
				{ searchTerm: marker, view, currentUserId: userId, page: 1, pageSize: 10 },
				now
			);

			return result.tickets.map((ticket) => ticket.id);
		}

		async function cleanUp() {
			for (const id of Object.values(ids)) {
				await deleteTestTicket(id);
			}

			await deleteTestUsers([anna.id, ben.id]);
		}

		return { anna, ben, now, ids, list, cleanUp };
	}

	test('"my tickets" lists open tickets I am assignee or next-step owner of, longest waiting first', async () => {
		const { anna, ids, list, cleanUp } = await setUp();

		try {
			expect(await list('mine', anna.id)).toEqual([
				ids.annaOverdue,
				// Same due time: ordered by ID.
				...[ids.benOwnsAnnasNextStep, ids.annaOwnsBensNextStep, ids.annaAssignedNoOwner].sort(),
				ids.annaOnTrack
			]);
		} finally {
			await cleanUp();
		}
	});

	test('"my overdue" lists overdue next steps I own, or that nobody owns on my tickets', async () => {
		const { anna, ben, ids, list, cleanUp } = await setUp();

		try {
			expect(await list('my_overdue', anna.id)).toEqual([
				ids.annaOverdue,
				...[ids.annaOwnsBensNextStep, ids.annaAssignedNoOwner].sort()
			]);
			expect(await list('my_overdue', ben.id)).toEqual([ids.benOwnsAnnasNextStep]);
		} finally {
			await cleanUp();
		}
	});

	test('"unassigned" lists open tickets without an assignee', async () => {
		const { anna, ids, list, cleanUp } = await setUp();

		try {
			expect(await list('unassigned', anna.id)).toEqual([ids.unassigned]);
		} finally {
			await cleanUp();
		}
	});

	test('counts match the personal views', async () => {
		const { anna, ben, now, cleanUp } = await setUp();

		try {
			// The test users only hold the tickets of this test, so their counts are exact.
			expect(await countTicketViews(testDb, anna.id, now)).toMatchObject({
				mine: 5,
				my_overdue: 3
			});
			expect(await countTicketViews(testDb, ben.id, now)).toMatchObject({
				mine: 2,
				my_overdue: 1
			});
		} finally {
			await cleanUp();
		}
	});
});
