import { z } from 'zod';

import { db } from '$lib/server/db';
import { tickets } from '$lib/server/db/schema/tickets';
import { logger } from '$lib/server/logger';

import { error, fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { ticketStatusHistory } from '$lib/server/db/schema/ticket-status-history';
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

	const statusHistory = await db
		.select()
		.from(ticketStatusHistory)
		.where(eq(ticketStatusHistory.ticketId, ticket.id))
		.orderBy(desc(ticketStatusHistory.changedAt), desc(ticketStatusHistory.id))
		.limit(50);

	return {
		ticket,
		statusHistory
	};
}) satisfies PageServerLoad;

export const actions = {
	updateStatus: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const versionValue = formData.get('expectedVersion');
		const resolutionValue = formData.get('resolution');
		const summaryValue = formData.get('resolutionSummary');

		const result = updateTicketStatusSchema.safeParse({
			ticketId: params.id,
			status: formData.get('status'),
			expectedVersion: typeof versionValue === 'string' ? Number(versionValue) : undefined,
			resolution:
				typeof resolutionValue === 'string' && resolutionValue !== '' ? resolutionValue : undefined,
			resolutionSummary: typeof summaryValue === 'string' ? summaryValue : undefined
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

			if (outcome === 'invalid_transition') {
				return fail(422, { message: 'This status change is not allowed.' });
			}

			if (outcome === 'resolution_required') {
				return fail(422, {
					message:
						'Resolving needs a resolution and a summary. Closing an unresolved ticket needs a reason.'
				});
			}

			return { message: 'Status updated.' };
		} catch (err) {
			logger.error('failed to update ticket status', {
				requestId: locals.requestId,
				ticketId: params.id,
				status: result.data.status,
				err
			});
			return fail(500, {
				message: 'The status could not be saved. Please try again.'
			});
		}
	}
} satisfies Actions;
