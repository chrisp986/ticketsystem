import { error } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';

import { ticketStatusSchema } from '$lib/modules/tickets/ticket.validation';
import { db } from '$lib/server/db';
import { tickets } from '$lib/server/db/schema/tickets';
import type { PageServerLoad } from './$types';

export const load = (async ({ url }) => {
	const statusParameter = url.searchParams.get('status');

	// A missing or empty parameter means "all statuses".
	const result = ticketStatusSchema
		.optional()
		.safeParse(statusParameter === null || statusParameter === '' ? undefined : statusParameter);

	if (!result.success) {
		error(400, 'Invalid status filter.');
	}

	const selectedStatus = result.data;

	const ticketRows = await db
		.select()
		.from(tickets)
		.where(selectedStatus === undefined ? undefined : eq(tickets.status, selectedStatus))
		.orderBy(desc(tickets.createdAt), tickets.id);

	return {
		tickets: ticketRows,
		selectedStatus: selectedStatus ?? ''
	};
}) satisfies PageServerLoad;
