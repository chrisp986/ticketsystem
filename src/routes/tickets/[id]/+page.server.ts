import { z } from 'zod';

import { db } from '$lib/server/db';
import { tickets } from '$lib/server/db/schema/tickets';

import { error, fail } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
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

		const { ticketId, status, expectedVersion } = result.data;
		const now = new Date();

		try {
			const [updatedTicket] = await db
				.update(tickets)
				.set({
					status,
					version: sql`${tickets.version} + 1`,
					updatedAt: now,
					resolvedAt:
						status === 'resolved' ? now : status === 'closed' ? sql`${tickets.resolvedAt}` : null,
					closedAt: status === 'closed' ? now : null
				})
				.where(and(eq(tickets.id, ticketId), eq(tickets.version, expectedVersion)))
				.returning({ id: tickets.id });

			if (!updatedTicket) {
				return fail(409, {
					message: 'The ticket changed or no longer exists. Reload before trying again.'
				});
			}
		} catch {
			return fail(500, {
				message: 'The status could not be saved. Please try again.'
			});
		}

		return { message: 'Status updated.' };
	}
} satisfies Actions;
