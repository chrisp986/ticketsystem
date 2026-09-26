import { and, eq, ne, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { z } from 'zod';

import type { updateTicketStatusSchema } from '../../modules/tickets/ticket.validation';
import { tickets } from '../db/schema/tickets';

type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;

type UpdateTicketStatusResult = 'updated' | 'unchanged' | 'conflict';

export async function updateTicketStatus(
	database: NodePgDatabase,
	input: UpdateTicketStatusInput
): Promise<UpdateTicketStatusResult> {
	const { ticketId, status, expectedVersion } = input;
	const now = new Date();

	const [updatedTicket] = await database
		.update(tickets)
		.set({
			status,
			version: sql`${tickets.version} + 1`,
			updatedAt: now,
			resolvedAt:
				status === 'resolved' ? now : status === 'closed' ? sql`${tickets.resolvedAt}` : null,
			closedAt: status === 'closed' ? now : null
		})
		.where(
			and(
				eq(tickets.id, ticketId),
				eq(tickets.version, expectedVersion),
				ne(tickets.status, status)
			)
		)
		.returning({ id: tickets.id });

	if (updatedTicket) {
		return 'updated';
	}

	const [currentTicket] = await database
		.select({
			status: tickets.status,
			version: tickets.version
		})
		.from(tickets)
		.where(eq(tickets.id, ticketId))
		.limit(1);

	if (
		currentTicket &&
		currentTicket.version === expectedVersion &&
		currentTicket.status === status
	) {
		return 'unchanged';
	}

	return 'conflict';
}
