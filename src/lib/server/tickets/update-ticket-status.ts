import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { z } from 'zod';

import type { updateTicketStatusSchema } from '../../modules/tickets/ticket.validation';
import type { Actor } from '../../modules/tickets/ticket.types';
import { tickets } from '../db/schema/tickets';
import { ticketStatusHistory } from '../db/schema/ticket-status-history';
import { checkStatusChange } from '../../modules/tickets/ticket.guard';
import type { GuardBlockerCode } from '../../modules/tickets/ticket.guard';
import { defaultNextStepDue, defaultNextSteps } from '../../modules/tickets/ticket.due';
import { ticketAttentionEvents } from '../db/schema/ticket-attention-events';

type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;
type UpdateTicketStatusResult = 'updated' | 'unchanged' | 'conflict' | GuardBlockerCode;

export async function updateTicketStatus(
	database: NodePgDatabase,
	input: UpdateTicketStatusInput,
	actor: Actor
): Promise<UpdateTicketStatusResult> {
	const {
		ticketId,
		status,
		expectedVersion,
		resolution,
		resolutionSummary,
		reason,
		nextStep,
		nextStepDue
	} = input;

	return database.transaction(async (tx): Promise<UpdateTicketStatusResult> => {
		const [currentTicket] = await tx
			.select({
				status: tickets.status,
				version: tickets.version,
				firstResolvedAt: tickets.firstResolvedAt,
				reopenCount: tickets.reopenCount,
				resolution: tickets.resolution,
				resolutionSummary: tickets.resolutionSummary,
				priority: tickets.priority,
				attentionSince: tickets.attentionSince,
				attentionReason: tickets.attentionReason
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

		const now = new Date();

		const guard = checkStatusChange(
			{ status: currentTicket.status, reopenCount: currentTicket.reopenCount },
			{ to: status, resolution, resolutionSummary, nextStep, nextStepDue, actorType: actor.type },
			now
		);

		const [blocker] = guard.blockers;

		if (blocker) {
			return blocker.code;
		}

		const keepsResolution = currentTicket.status === 'resolved' && status === 'closed';

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

		const isOpen = status !== 'closed';

		const nextStepValue = isOpen ? nextStep || defaultNextSteps[status] : null;

		const nextStepDueValue = isOpen
			? (nextStepDue ?? defaultNextStepDue(status, currentTicket.priority, now))
			: null;

		const isReopen = currentTicket.status === 'resolved' && status === 'in_progress';
		const clearsAttention =
			currentTicket.attentionReason !== null && (actor.type === 'user' || !isOpen);

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
				resolutionSummary: nextResolutionSummary,
				nextStep: nextStepValue,
				nextStepDue: nextStepDueValue,
				...(clearsAttention ? { attentionSince: null, attentionReason: null } : {})
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

		if (clearsAttention && currentTicket.attentionReason) {
			await tx.insert(ticketAttentionEvents).values({
				ticketId,
				eventType: 'cleared',
				reason: currentTicket.attentionReason,
				clearType: 'status_change',
				actorType: actor.type,
				actorId: actor.id ?? null,
				occurredAt: now
			});
		}

		return 'updated';
	});
}
