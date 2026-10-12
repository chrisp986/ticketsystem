import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { defaultNextStepDue, defaultNextSteps } from '../../modules/tickets/ticket.due';
import type { CreateTicketInput } from '../../modules/tickets/ticket.types';
import { tickets } from '../db/schema/tickets';

export type Ticket = typeof tickets.$inferSelect;

export async function createTicket(
	database: NodePgDatabase,
	input: CreateTicketInput,
	now: Date = new Date()
): Promise<Ticket> {
	const [ticket] = await database
		.insert(tickets)
		.values({
			...input,
			nextStep: defaultNextSteps.new,
			nextStepDue: defaultNextStepDue('new', input.priority, now)
		})
		.returning();

	if (!ticket) {
		throw new Error('Ticket insert returned no row.');
	}

	return ticket;
}
