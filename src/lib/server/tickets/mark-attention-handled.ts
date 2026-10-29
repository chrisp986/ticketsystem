import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { z } from 'zod';

import type { Actor } from '../../modules/tickets/ticket.types';
import type { markAttentionHandledSchema } from '../../modules/tickets/ticket.validation';
import { ticketAttentionEvents } from '../db/schema/ticket-attention-events';
import { tickets } from '../db/schema/tickets';
import { actorFields } from './actor-fields';

type MarkAttentionHandledInput = z.infer<typeof markAttentionHandledSchema>;

type MarkAttentionHandledResult = 'cleared' | 'unchanged' | 'conflict';

/**
 * Clears a ticket's attention without changing its status (ADR 0002).
 */
export async function markAttentionHandled(
	database: NodePgDatabase,
	input: MarkAttentionHandledInput,
	actor: Actor
): Promise<MarkAttentionHandledResult> {
	const { ticketId, expectedVersion } = input;

	return database.transaction(async (tx): Promise<MarkAttentionHandledResult> => {
		const [currentTicket] = await tx
			.select({
				version: tickets.version,
				attentionReason: tickets.attentionReason
			})
			.from(tickets)
			.where(eq(tickets.id, ticketId))
			.limit(1)
			.for('update');

		if (!currentTicket || currentTicket.version !== expectedVersion) {
			return 'conflict';
		}

		if (currentTicket.attentionReason === null) {
			return 'unchanged';
		}

		const now = new Date();

		await tx
			.update(tickets)
			.set({
				attentionSince: null,
				attentionReason: null,
				version: sql`${tickets.version} + 1`,
				updatedAt: now
			})
			.where(eq(tickets.id, ticketId));

		await tx.insert(ticketAttentionEvents).values({
			ticketId,
			eventType: 'cleared',
			reason: currentTicket.attentionReason,
			clearType: 'manual',
			...actorFields(actor),
			occurredAt: now
		});

		return 'cleared';
	});
}
