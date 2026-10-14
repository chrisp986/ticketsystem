import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { defaultNextStepDue, defaultNextSteps } from '../../modules/tickets/ticket.due';
import type { Actor, CreateTicketInput } from '../../modules/tickets/ticket.types';
import { ticketAttentionEvents } from '../db/schema/ticket-attention-events';
import { tickets } from '../db/schema/tickets';

export type Ticket = typeof tickets.$inferSelect;

export async function createTicket(
	database: NodePgDatabase,
	input: CreateTicketInput,
	actor: Actor,
	now: Date = new Date()
): Promise<Ticket> {
	return database.transaction(async (tx) => {
		const [ticket] = await tx
			.insert(tickets)
			.values({
				...input,
				nextStep: defaultNextSteps.new,
				nextStepDue: defaultNextStepDue('new', input.priority, now),
				attentionSince: now,
				attentionReason: 'new_ticket'
			})
			.returning();

		if (!ticket) {
			throw new Error('Ticket insert returned no row.');
		}

		await tx.insert(ticketAttentionEvents).values({
			ticketId: ticket.id,
			eventType: 'raised',
			reason: 'new_ticket',
			actorType: actor.type,
			actorId: actor.id ?? null,
			occurredAt: now
		});

		return ticket;
	});
}
