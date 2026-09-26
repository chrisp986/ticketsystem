import { z } from 'zod';

import { db } from '$lib/server/db';
import { tickets } from '$lib/server/db/schema/tickets';

import { error, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { updateTicketStatus } from '$lib/server/tickets/update-ticket-status';
import type { Actions, PageServerLoad } from './$types';
import { updateTicketStatusSchema } from '$lib/modules/tickets/ticket.validation';

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

export const actions = {
	updateStatus: async ({ request, params }) => {
		const formData = await request.formData();
		const versionValue = formData.get('expectedVersion');

		const result = updateTicketStatusSchema.safeParse({
			ticketId: params.id,
			status: formData.get('status'),
			expectedVersion: typeof versionValue === 'string' ? Number(versionValue) : undefined
		});

		if (!result.success) {
			return fail(400, {
				message: 'Please select a valid status and reload if necessary.'
			});
		}

		try {
			const outcome = await updateTicketStatus(db, result.data);

			if (outcome === 'unchanged') {
				return { message: 'Status is already up to date.' };
			}

			if (outcome === 'conflict') {
				return fail(409, {
					message: 'The ticket changed or no longer exists. Reload before trying again.'
				});
			}

			return { message: 'Status updated.' };
		} catch {
			return fail(500, {
				message: 'The status could not be saved. Please try again.'
			});
		}
	}
} satisfies Actions;
