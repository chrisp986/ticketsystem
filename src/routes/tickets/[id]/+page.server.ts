import { z } from 'zod';

import { db } from '$lib/server/db';
import { tickets } from '$lib/server/db/schema/tickets';
import { logger } from '$lib/server/logger';

import { error, fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { ticketStatusHistory } from '$lib/server/db/schema/ticket-status-history';
import { updateTicketStatus } from '$lib/server/tickets/update-ticket-status';
import type { Actions, PageServerLoad } from './$types';
import {
	assignTicketSchema,
	updateTicketStatusSchema,
	markAttentionHandledSchema
} from '$lib/modules/tickets/ticket.validation';
import { markAttentionHandled } from '$lib/server/tickets/mark-attention-handled';
import { assignTicket } from '$lib/server/tickets/assign-ticket';
import { listUsers } from '$lib/server/auth/users';
import { userActor } from '$lib/server/auth/actor';
import { fromLocalInputValue } from '$lib/modules/time/local-datetime';
import type { GuardBlockerCode } from '$lib/modules/tickets/ticket.guard';

const ticketIdSchema = z.uuid();

/**
 * One message per guard blocker. A new blocker code fails type checking until it has a message here.
 */
const blockerMessages: Record<GuardBlockerCode, string> = {
	invalid_transition: 'This status change is not allowed.',
	resolution_required:
		'Resolving needs a resolution and a summary. Closing an unresolved ticket needs a reason.',
	next_step_required: 'Describe the next step.',
	next_step_due_in_past: 'The due date is in the past.',
	human_required: 'Only a person can close a ticket.'
};

const inactiveUserMessage = 'Only active users can be assigned. Reload and choose again.';

/**
 * Reads an assignee or owner field: missing keeps the value, empty clears it.
 */
function ownerField(formData: FormData, name: string): FormDataEntryValue | null | undefined {
	const value = formData.get(name);

	if (value === null) {
		return undefined;
	}

	return value === '' ? null : value;
}

export const load = (async ({ params, locals }) => {
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

	const users = await listUsers(db);

	return {
		ticket,
		statusHistory,
		users,
		currentUserId: userActor(locals.user).id
	};
}) satisfies PageServerLoad;

export const actions = {
	updateStatus: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const versionValue = formData.get('expectedVersion');
		const resolutionValue = formData.get('resolution');
		const summaryValue = formData.get('resolutionSummary');
		const reasonValue = formData.get('reason');
		const nextStepValue = formData.get('nextStep');
		const dueValue = formData.get('nextStepDue');

		const nextStepDue =
			typeof dueValue === 'string' && dueValue !== '' ? fromLocalInputValue(dueValue) : undefined;

		if (nextStepDue === null) {
			return fail(400, { message: 'Please enter a valid due date.' });
		}

		const result = updateTicketStatusSchema.safeParse({
			ticketId: params.id,
			status: formData.get('status'),
			expectedVersion: typeof versionValue === 'string' ? Number(versionValue) : undefined,
			resolution:
				typeof resolutionValue === 'string' && resolutionValue !== '' ? resolutionValue : undefined,
			resolutionSummary: typeof summaryValue === 'string' ? summaryValue : undefined,
			reason: typeof reasonValue === 'string' ? reasonValue : undefined,
			nextStep: typeof nextStepValue === 'string' ? nextStepValue : undefined,
			nextStepDue,
			nextStepOwnerId: ownerField(formData, 'nextStepOwnerId')
		});

		if (!result.success) {
			return fail(400, {
				message: 'Please select a valid status and reload if necessary.'
			});
		}

		try {
			const outcome = await updateTicketStatus(db, result.data, userActor(locals.user));

			if (outcome === 'unchanged') {
				return { message: 'Status is already up to date.' };
			}

			if (outcome === 'conflict') {
				return fail(409, {
					message: 'The ticket changed or no longer exists. Reload before trying again.'
				});
			}

			if (outcome === 'updated') {
				return { message: 'Status updated.' };
			}

			if (outcome === 'inactive_user') {
				return fail(422, { message: inactiveUserMessage });
			}

			return fail(422, { message: blockerMessages[outcome] });
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
	},

	markHandled: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const versionValue = formData.get('expectedVersion');

		const result = markAttentionHandledSchema.safeParse({
			ticketId: params.id,
			expectedVersion: typeof versionValue === 'string' ? Number(versionValue) : undefined
		});

		if (!result.success) {
			return fail(400, { message: 'Please reload the ticket and try again.' });
		}

		try {
			const outcome = await markAttentionHandled(db, result.data, userActor(locals.user));

			if (outcome === 'conflict') {
				return fail(409, {
					message: 'The ticket changed or no longer exists. Reload before trying again.'
				});
			}

			if (outcome === 'unchanged') {
				return { message: 'Nothing needed attention.' };
			}

			return { message: 'Marked as handled.' };
		} catch (err) {
			logger.error('failed to mark attention as handled', {
				requestId: locals.requestId,
				ticketId: params.id,
				err
			});

			return fail(500, { message: 'Could not mark as handled. Please try again.' });
		}
	},

	assign: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const versionValue = formData.get('expectedVersion');
		const actor = userActor(locals.user);

		const result = assignTicketSchema.safeParse({
			ticketId: params.id,
			expectedVersion: typeof versionValue === 'string' ? Number(versionValue) : undefined,
			assigneeId: formData.has('assignToMe') ? actor.id : ownerField(formData, 'assigneeId'),
			nextStepOwnerId: ownerField(formData, 'nextStepOwnerId')
		});

		if (!result.success) {
			return fail(400, { message: 'Please reload the ticket and try again.' });
		}

		try {
			const outcome = await assignTicket(db, result.data, actor);

			if (outcome === 'conflict') {
				return fail(409, {
					message: 'The ticket changed or no longer exists. Reload before trying again.'
				});
			}

			if (outcome === 'ticket_closed') {
				return fail(422, { message: 'Closed tickets cannot be reassigned.' });
			}

			if (outcome === 'inactive_user') {
				return fail(422, { message: inactiveUserMessage });
			}

			if (outcome === 'unchanged') {
				return { message: 'Assignment is already up to date.' };
			}

			return { message: 'Assignment saved.' };
		} catch (err) {
			logger.error('failed to assign ticket', {
				requestId: locals.requestId,
				ticketId: params.id,
				err
			});

			return fail(500, { message: 'The assignment could not be saved. Please try again.' });
		}
	}
} satisfies Actions;
