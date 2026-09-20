import { db } from '$lib/server/db';
import { tickets } from '$lib/server/db/schema/tickets';
import type { PageServerLoad } from './$types';

export const load = (async () => {
	const ticketRows = await db.select().from(tickets);

	return {
		tickets: ticketRows
	};
}) satisfies PageServerLoad;
