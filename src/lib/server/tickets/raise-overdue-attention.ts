import { and, asc, eq, gte, isNull, lt, ne, notExists, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { Actor } from '../../modules/tickets/ticket.types';
import { ticketAttentionEvents } from '../db/schema/ticket-attention-events';
import { tickets } from '../db/schema/tickets';
import { actorFields } from './actor-fields';

const overdueJobActor: Actor = { type: 'system', name: 'overdue-job' };

async function raiseForOneTicket(database: NodePgDatabase, now: Date): Promise<boolean> {
	return database.transaction(async (tx) => {
		const [ticket] = await tx
			.select({ id: tickets.id })
			.from(tickets)
			.where(
				and(
					ne(tickets.status, 'closed'),
					lt(tickets.nextStepDue, now),
					isNull(tickets.attentionSince),
					notExists(
						tx
							.select({ id: ticketAttentionEvents.id })
							.from(ticketAttentionEvents)
							.where(
								and(
									eq(ticketAttentionEvents.ticketId, tickets.id),
									eq(ticketAttentionEvents.eventType, 'raised'),
									eq(ticketAttentionEvents.reason, 'next_step_overdue'),
									gte(ticketAttentionEvents.occurredAt, tickets.nextStepDue)
								)
							)
					)
				)
			)
			.orderBy(asc(tickets.nextStepDue))
			.limit(1)
			.for('update', { of: tickets, skipLocked: true });

		if (!ticket) {
			return false;
		}

		await tx
			.update(tickets)
			.set({
				attentionSince: now,
				attentionReason: 'next_step_overdue',
				version: sql`${tickets.version} + 1`,
				updatedAt: now
			})
			.where(eq(tickets.id, ticket.id));

		await tx.insert(ticketAttentionEvents).values({
			ticketId: ticket.id,
			eventType: 'raised',
			reason: 'next_step_overdue',
			...actorFields(overdueJobActor),
			occurredAt: now
		});

		return true;
	});
}

/**
 * Raises attention on open tickets with an overdue next step and returns how many (ADR 0002).
 *
 * Existing attention stays as it is. Each due date raises attention only once, so marking a
 * ticket as handled sticks while its next step stays overdue. Safe to run twice or at once.
 */
export async function raiseOverdueAttention(
	database: NodePgDatabase,
	now: Date = new Date()
): Promise<number> {
	let raised = 0;

	while (await raiseForOneTicket(database, now)) {
		raised += 1;
	}

	return raised;
}
