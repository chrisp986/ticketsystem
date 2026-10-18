import { error } from '@sveltejs/kit';
import { z } from 'zod';

import { ticketViews } from '$lib/modules/tickets/ticket.constants';
import { ticketStatusSchema } from '$lib/modules/tickets/ticket.validation';
import { db } from '$lib/server/db';
import { listTickets } from '$lib/server/tickets/list-tickets';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 10;
const searchSchema = z.string().trim().max(200);
const viewSchema = z.enum(ticketViews);

const pageSchema = z
	.string()
	.regex(/^[1-9]\d*$/)
	.transform(Number)
	.pipe(z.number().int().min(1).max(100_000));

export const load = (async ({ url }) => {
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

	const viewResult = viewSchema.safeParse(url.searchParams.get('view') || 'all');

	if (!viewResult.success) {
		error(400, 'Invalid view.');
	}

	const selectedStatus = statusResult.data;
	const searchTerm = searchResult.data;
	const page = pageResult.data;
	const view = viewResult.data;

	const result = await listTickets(db, {
		status: selectedStatus,
		searchTerm,
		view,
		page,
		pageSize: PAGE_SIZE
	});

	return {
		tickets: result.tickets,
		selectedStatus: selectedStatus ?? '',
		searchTerm,
		view,
		page,
		hasPreviousPage: page > 1,
		hasNextPage: result.hasNextPage
	};
}) satisfies PageServerLoad;
