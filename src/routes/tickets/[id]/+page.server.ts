import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '$lib/server/db';
import { tickets } from '$lib/server/db/schema/tickets';
import type { PageServerLoad } from './$types';

const ticketIdSchema = z.uuid();

export const load = (async ({ params }) => {
	const result = ticketIdSchema.safeParse(params.id);

	if (!result.success) {
		error(400, 'Invalid ticket ID.');
	}

	const [ticket] = await db.select().from(tickets).where(eq(tickets.id, result.data)).limit(1);

	if (!ticket) {
		error(404, 'Ticket not found.');
	}

	return { ticket };
}) satisfies PageServerLoad;
