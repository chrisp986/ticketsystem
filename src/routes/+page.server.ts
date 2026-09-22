import { error } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { ticketStatusSchema } from '$lib/modules/tickets/ticket.validation';
import { db } from '$lib/server/db';
import { tickets } from '$lib/server/db/schema/tickets';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 10;

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

	const selectedStatus = statusResult.data;
	const page = pageResult.data;
	const offset = (page - 1) * PAGE_SIZE;

	const ticketRows = await db
		.select()
		.from(tickets)
		.where(selectedStatus === undefined ? undefined : eq(tickets.status, selectedStatus))
		.orderBy(desc(tickets.createdAt), desc(tickets.id))
		.limit(PAGE_SIZE + 1)
		.offset(offset);

	return {
		tickets: ticketRows.slice(0, PAGE_SIZE),
		selectedStatus: selectedStatus ?? '',
		page,
		hasPreviousPage: page > 1,
		hasNextPage: ticketRows.length > PAGE_SIZE
	};
}) satisfies PageServerLoad;
