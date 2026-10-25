import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { defaultNextStepDue, defaultNextSteps } from '../../modules/tickets/ticket.due';
import type { Actor, CreateTicketInput } from '../../modules/tickets/ticket.types';
import { ticketAttentionEvents } from '../db/schema/ticket-attention-events';
import { tickets } from '../db/schema/tickets';
import { actorFields } from './actor-fields';
import { hasInactiveUser, recordOwnershipChanges } from './ownership';

export type Ticket = typeof tickets.$inferSelect;

/**
 * Creates a ticket, optionally assigned. The assignee also owns the triage step (ADR 0008).
 */
export async function createTicket(
	database: NodePgDatabase,
	input: CreateTicketInput,
	actor: Actor,
	now: Date = new Date()
): Promise<Ticket | 'inactive_user'> {
	const assigneeId = input.assigneeId ?? null;
	const { actorType, actorId, actorName } = actorFields(actor);

	return database.transaction(async (tx) => {
		if (assigneeId && (await hasInactiveUser(tx, [assigneeId]))) {
			return 'inactive_user';
		}

		const [ticket] = await tx
			.insert(tickets)
			.values({
				...input,
				assigneeId,
				nextStepOwnerId: assigneeId,
				nextStep: defaultNextSteps.new,
				nextStepDue: defaultNextStepDue('new', input.priority, now),
				attentionSince: now,
				attentionReason: 'new_ticket',
				createdAt: now,
				updatedAt: now,
				createdByType: actorType,
				createdById: actorId,
				createdByName: actorName
			})
			.returning();

		if (!ticket) {
			throw new Error('Ticket insert returned no row.');
		}

		await tx.insert(ticketAttentionEvents).values({
			ticketId: ticket.id,
			eventType: 'raised',
			reason: 'new_ticket',
			...actorFields(actor),
			occurredAt: now
		});

		await recordOwnershipChanges(
			tx,
			ticket.id,
			{ assigneeId: null, nextStepOwnerId: null },
			{ assigneeId, nextStepOwnerId: assigneeId },
			actor,
			now
		);

		return ticket;
	});
}
