import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { CreateTicketInput } from '../../modules/tickets/ticket.types';
import { tickets } from '../db/schema/tickets';

export type Ticket = typeof tickets.$inferSelect;

export async function createTicket(
	database: NodePgDatabase,
	input: CreateTicketInput
): Promise<Ticket> {
	const [ticket] = await database.insert(tickets).values(input).returning();

	if (!ticket) {
		throw new Error('Ticket insert returned no row.');
	}

	return ticket;
}
