import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { z } from 'zod';

import type { updateTicketStatusSchema } from '../../modules/tickets/ticket.validation';
import type { Actor } from '../../modules/tickets/ticket.types';
import { tickets } from '../db/schema/tickets';
import { ticketStatusHistory } from '../db/schema/ticket-status-history';
import { canTransition } from '../../modules/tickets/ticket.transitions';
import { isResolutionValid } from '../../modules/tickets/ticket.resolution';

type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;

type UpdateTicketStatusResult =
	'updated' | 'unchanged' | 'conflict' | 'invalid_transition' | 'resolution_required';

export async function updateTicketStatus(
	database: NodePgDatabase,
	input: UpdateTicketStatusInput,
	actor: Actor
): Promise<UpdateTicketStatusResult> {
	const { ticketId, status, expectedVersion, resolution, resolutionSummary, reason } = input;

	return database.transaction(async (tx): Promise<UpdateTicketStatusResult> => {
		const [currentTicket] = await tx
			.select({
				status: tickets.status,
				version: tickets.version,
				firstResolvedAt: tickets.firstResolvedAt,
				reopenCount: tickets.reopenCount,
				resolution: tickets.resolution,
				resolutionSummary: tickets.resolutionSummary
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

		const keepsResolution = currentTicket.status === 'resolved' && status === 'closed';

		if (!keepsResolution && !isResolutionValid(status, resolution, resolutionSummary)) {
			return 'resolution_required';
		}

		const endsTicket = status === 'resolved' || status === 'closed';

		const nextResolution = keepsResolution
			? currentTicket.resolution
			: endsTicket
				? (resolution ?? null)
				: null;

		const nextResolutionSummary = keepsResolution
			? currentTicket.resolutionSummary
			: endsTicket
				? resolutionSummary || null
				: null;

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
				reopenCount: isReopen ? currentTicket.reopenCount + 1 : currentTicket.reopenCount,
				resolution: nextResolution,
				resolutionSummary: nextResolutionSummary
			})
			.where(eq(tickets.id, ticketId));

		await tx.insert(ticketStatusHistory).values({
			ticketId,
			previousStatus: currentTicket.status,
			newStatus: status,
			changedAt: now,
			actorType: actor.type,
			actorId: actor.id ?? null,
			reason: reason || null,
			resolution: nextResolution,
			resolutionSummary: nextResolutionSummary
		});

		return 'updated';
	});
}
