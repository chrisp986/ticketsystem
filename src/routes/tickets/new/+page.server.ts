import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { logger } from '$lib/server/logger';
import { createTicketSchema } from '$lib/modules/tickets/ticket.validation';
import { createTicket } from '$lib/server/tickets/create-ticket';
import { listUsers } from '$lib/server/auth/users';
import { userActor } from '$lib/server/auth/actor';
import type { Actions, PageServerLoad } from './$types';

export const load = (async () => {
	const users = await listUsers(db);

	return { users: users.filter((user) => user.active) };
}) satisfies PageServerLoad;

export const actions = {
	default: async ({ request, locals }) => {
		const formData = await request.formData();

		const subject = formData.get('subject');
		const description = formData.get('description');
		const assigneeId = formData.get('assigneeId');

		// Only return strings to the text fields.
		const values = {
			subject: typeof subject === 'string' ? subject : '',
			description: typeof description === 'string' ? description : '',
			assigneeId: typeof assigneeId === 'string' ? assigneeId : ''
		};

		// Validate the original submitted values.
		const result = createTicketSchema.safeParse({
			subject,
			description,
			assigneeId: assigneeId === '' || assigneeId === null ? undefined : assigneeId
		});

		if (!result.success) {
			return fail(400, {
				message: result.error.issues[0]?.message ?? 'Please check your input.',
				values
			});
		}

		try {
			const created = await createTicket(db, result.data, userActor(locals.user));

			if (created === 'inactive_user') {
				return fail(422, {
					message: 'Only active users can be assigned. Please choose again.',
					values
				});
			}
		} catch (err) {
			logger.error('failed to create ticket', { requestId: locals.requestId, err });
			return fail(500, {
				message: 'The ticket could not be saved. Please try again.',
				values
			});
		}

		redirect(303, '/');
	}
} satisfies Actions;
