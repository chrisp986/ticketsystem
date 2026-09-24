import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { tickets } from '$lib/server/db/schema/tickets';
import { createTicketSchema } from '$lib/modules/tickets/ticket.validation';
import type { Actions } from './$types';

export const actions = {
	default: async ({ request }) => {
		const formData = await request.formData();

		const subject = formData.get('subject');
		const description = formData.get('description');

		// Only return strings to the text fields.
		const values = {
			subject: typeof subject === 'string' ? subject : '',
			description: typeof description === 'string' ? description : ''
		};

		// Validate the original submitted values.
		const result = createTicketSchema.safeParse({
			subject,
			description
		});

		if (!result.success) {
			return fail(400, {
				message: result.error.issues[0]?.message ?? 'Please check your input.',
				values
			});
		}

		try {
			await db.insert(tickets).values(result.data);
		} catch {
			return fail(500, {
				message: 'The ticket could not be saved. Please try again.',
				values
			});
		}

		redirect(303, '/');
	}
} satisfies Actions;
