import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { z } from 'zod';

import { newlyAssignedUserIds, resolveAssignment } from '../../modules/tickets/ticket.ownership';
import type { Actor } from '../../modules/tickets/ticket.types';
import type { assignTicketSchema } from '../../modules/tickets/ticket.validation';
import { tickets } from '../db/schema/tickets';
import { hasInactiveUser, recordOwnershipChanges } from './ownership';

type AssignTicketInput = z.infer<typeof assignTicketSchema>;

type AssignTicketResult = 'assigned' | 'unchanged' | 'conflict' | 'ticket_closed' | 'inactive_user';

/**
 * Changes a ticket's assignee and next-step owner without changing its status (ADR 0008).
 */
export async function assignTicket(
	database: NodePgDatabase,
	input: AssignTicketInput,
	actor: Actor
): Promise<AssignTicketResult> {
	const { ticketId, expectedVersion, assigneeId, nextStepOwnerId } = input;

	return database.transaction(async (tx): Promise<AssignTicketResult> => {
		const [currentTicket] = await tx
			.select({
				status: tickets.status,
				version: tickets.version,
				assigneeId: tickets.assigneeId,
				nextStepOwnerId: tickets.nextStepOwnerId
			})
			.from(tickets)
			.where(eq(tickets.id, ticketId))
			.limit(1)
			.for('update');

		if (!currentTicket || currentTicket.version !== expectedVersion) {
			return 'conflict';
		}

		if (currentTicket.status === 'closed') {
			return 'ticket_closed';
		}

		const before = {
			assigneeId: currentTicket.assigneeId,
			nextStepOwnerId: currentTicket.nextStepOwnerId
		};

		const after = resolveAssignment(before, { assigneeId, nextStepOwnerId });

		if (
			after.assigneeId === before.assigneeId &&
			after.nextStepOwnerId === before.nextStepOwnerId
		) {
			return 'unchanged';
		}

		if (await hasInactiveUser(tx, newlyAssignedUserIds(before, after))) {
			return 'inactive_user';
		}

		const now = new Date();

		await tx
			.update(tickets)
			.set({
				assigneeId: after.assigneeId,
				nextStepOwnerId: after.nextStepOwnerId,
				version: sql`${tickets.version} + 1`,
				updatedAt: now
			})
			.where(eq(tickets.id, ticketId));

		await recordOwnershipChanges(tx, ticketId, before, after, actor, now);

		return 'assigned';
	});
}
