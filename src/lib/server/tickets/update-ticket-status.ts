import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { z } from 'zod';

import type { updateTicketStatusSchema } from '../../modules/tickets/ticket.validation';
import { tickets } from '../db/schema/tickets';
import { ticketStatusHistory } from '../db/schema/ticket-status-history';
import { canTransition } from '../../modules/tickets/ticket.transitions';

type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;

type UpdateTicketStatusResult = 'updated' | 'unchanged' | 'conflict' | 'invalid_transition';

export async function updateTicketStatus(
	database: NodePgDatabase,
	input: UpdateTicketStatusInput
): Promise<UpdateTicketStatusResult> {
	const { ticketId, status, expectedVersion } = input;

	return database.transaction(async (tx): Promise<UpdateTicketStatusResult> => {
		const [currentTicket] = await tx
			.select({
				status: tickets.status,
				version: tickets.version,
				firstResolvedAt: tickets.firstResolvedAt,
				reopenCount: tickets.reopenCount
			})
			.from(tickets)
			.where(eq(tickets.id, ticketId))
			.limit(1)
			.for('update');

		if (!currentTicket || currentTicket.version !== expectedVersion) {
			return 'conflict';
		}

		if (currentTicket.status === status) {
			return 'unchanged';
		}

		if (!canTransition(currentTicket.status, status)) {
			return 'invalid_transition';
		}

		const now = new Date();

		const isReopen = currentTicket.status === 'resolved' && status === 'in_progress';

		await tx
			.update(tickets)
			.set({
				status,
				version: sql`${tickets.version} + 1`,
				updatedAt: now,
				resolvedAt:
					status === 'resolved' ? now : status === 'closed' ? sql`${tickets.resolvedAt}` : null,
				closedAt: status === 'closed' ? now : null,
				firstResolvedAt:
					status === 'resolved'
						? (currentTicket.firstResolvedAt ?? now)
						: currentTicket.firstResolvedAt,
				reopenCount: isReopen ? currentTicket.reopenCount + 1 : currentTicket.reopenCount
			})
			.where(eq(tickets.id, ticketId));

		await tx.insert(ticketStatusHistory).values({
			ticketId,
			previousStatus: currentTicket.status,
			newStatus: status,
			changedAt: now
		});

		return 'updated';
	});
}
