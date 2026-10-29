import { error } from '@sveltejs/kit';
import { z } from 'zod';

import { ticketViews } from '$lib/modules/tickets/ticket.constants';
import { ticketStatusSchema } from '$lib/modules/tickets/ticket.validation';
import { db } from '$lib/server/db';
import { countTicketViews, listTickets } from '$lib/server/tickets/list-tickets';
import { listUsers } from '$lib/server/auth/users';
import { userActor } from '$lib/server/auth/actor';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 10;
const searchSchema = z.string().trim().max(200);
const viewSchema = z.enum(ticketViews);

// The list opens on the signed-in user's own work queue (ADR 0008).
const defaultView = ticketViews[0];

const pageSchema = z
	.string()
	.regex(/^[1-9]\d*$/)
	.transform(Number)
	.pipe(z.number().int().min(1).max(100_000));

export const load = (async ({ url, locals }) => {
	const currentUserId = userActor(locals.user).id;

	const statusParameter = url.searchParams.get('status');

	const statusResult = ticketStatusSchema
		.optional()
		.safeParse(statusParameter === null || statusParameter === '' ? undefined : statusParameter);

	if (!statusResult.success) {
		error(400, 'Invalid status filter.');
	}

	const pageResult = pageSchema.safeParse(url.searchParams.get('page') ?? '1');

	if (!pageResult.success) {
		error(400, 'Invalid page number.');
	}

	const searchResult = searchSchema.safeParse(url.searchParams.get('q') ?? '');

	if (!searchResult.success) {
		error(400, 'Search must be 200 characters or fewer.');
	}

	const viewResult = viewSchema.safeParse(url.searchParams.get('view') || defaultView);

	if (!viewResult.success) {
		error(400, 'Invalid view.');
	}

	const selectedStatus = statusResult.data;
	const searchTerm = searchResult.data;
	const page = pageResult.data;
	const view = viewResult.data;

	const now = new Date();

	const [result, viewCounts, users] = await Promise.all([
		listTickets(
			db,
			{ status: selectedStatus, searchTerm, view, currentUserId, page, pageSize: PAGE_SIZE },
			now
		),
		countTicketViews(db, currentUserId, now),
		listUsers(db)
	]);

	return {
		tickets: result.tickets,
		userNames: Object.fromEntries(users.map((user) => [user.id, user.name])),
		selectedStatus: selectedStatus ?? '',
		searchTerm,
		view,
		defaultView,
		viewCounts,
		page,
		hasPreviousPage: page > 1,
		hasNextPage: result.hasNextPage
	};
}) satisfies PageServerLoad;
