import { and, eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { TicketOwnership } from '../../modules/tickets/ticket.ownership';
import type { Actor } from '../../modules/tickets/ticket.types';
import { ticketAssignmentHistory } from '../db/schema/ticket-assignment-history';
import { users } from '../db/schema/users';

type Queryable = Pick<NodePgDatabase, 'select' | 'insert'>;

/**
 * True unless every ID belongs to an active user (ADR 0008).
 */
export async function hasInactiveUser(database: Queryable, userIds: string[]): Promise<boolean> {
	if (userIds.length === 0) {
		return false;
	}

	const active = await database
		.select({ id: users.id })
		.from(users)
		.where(and(inArray(users.id, userIds), eq(users.active, true)));

	return active.length !== userIds.length;
}

/**
 * Writes one history row per ownership field that changed.
 */
export async function recordOwnershipChanges(
	database: Queryable,
	ticketId: string,
	before: TicketOwnership,
	after: TicketOwnership,
	actor: Actor,
	changedAt: Date
): Promise<void> {
	const base = {
		ticketId,
		actorType: actor.type,
		actorId: actor.type === 'user' ? (actor.id ?? null) : null,
		changedAt
	};

	const rows = [];

	if (before.assigneeId !== after.assigneeId) {
		rows.push({
			...base,
			field: 'assignee' as const,
			previousUserId: before.assigneeId,
			newUserId: after.assigneeId
		});
	}

	if (before.nextStepOwnerId !== after.nextStepOwnerId) {
		rows.push({
			...base,
			field: 'next_step_owner' as const,
			previousUserId: before.nextStepOwnerId,
			newUserId: after.nextStepOwnerId
		});
	}

	if (rows.length > 0) {
		await database.insert(ticketAssignmentHistory).values(rows);
	}
}
