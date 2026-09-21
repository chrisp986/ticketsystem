import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { tickets } from '$lib/server/db/schema/tickets';
import { createTicketSchema } from '$lib/modules/tickets/ticket.validation';
import type { Actions } from './$types';

export const actions = {
	default: async ({ request }) => {
		const formData = await request.formData();

		const result = createTicketSchema.safeParse({
			subject: formData.get('subject'),
			description: formData.get('description')
		});

		if (!result.success) {
			return fail(400, {
				message: result.error.issues[0]?.message ?? 'Please check your input.'
			});
		}

		try {
			await db.insert(tickets).values(result.data);
		} catch {
			return fail(500, {
				message: 'The ticket could not be saved. Please try again.'
			});
		}

		redirect(303, '/');
	}
} satisfies Actions;
