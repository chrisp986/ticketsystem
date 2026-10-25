import type { Actor, TicketStatus } from './ticket.types';

/**
 * Who is responsible for a ticket and who does its next step (ADR 0008).
 */
export type TicketOwnership = {
	assigneeId: string | null;
	nextStepOwnerId: string | null;
};

/**
 * A requested ownership change. `undefined` keeps a field, `null` clears it.
 */
export type OwnershipRequest = {
	assigneeId?: string | null;
	nextStepOwnerId?: string | null;
};

/**
 * Ownership after an assignment.
 *
 * The next-step owner follows a new assignee if it was empty or the previous
 * assignee, unless the same request changes it.
 */
export function resolveAssignment(
	current: TicketOwnership,
	request: OwnershipRequest
): TicketOwnership {
	const assigneeId = request.assigneeId === undefined ? current.assigneeId : request.assigneeId;

	if (
		request.nextStepOwnerId !== undefined &&
		request.nextStepOwnerId !== current.nextStepOwnerId
	) {
		return { assigneeId, nextStepOwnerId: request.nextStepOwnerId };
	}

	const ownerFollows =
		assigneeId !== current.assigneeId &&
		(current.nextStepOwnerId === null || current.nextStepOwnerId === current.assigneeId);

	return { assigneeId, nextStepOwnerId: ownerFollows ? assigneeId : current.nextStepOwnerId };
}

/**
 * Ownership after a status change.
 *
 * A person who moves an unassigned ticket out of `new` becomes its assignee.
 * The new next step belongs to the chosen owner, by default the assignee.
 * Closed tickets have no next-step owner.
 */
export function ownershipAfterStatusChange(
	current: TicketOwnership,
	change: { from: TicketStatus; to: TicketStatus; nextStepOwnerId?: string | null },
	actor: Actor
): TicketOwnership {
	const claims = current.assigneeId === null && change.from === 'new' && actor.type === 'user';

	const assigneeId = claims ? actor.id : current.assigneeId;

	if (change.to === 'closed') {
		return { assigneeId, nextStepOwnerId: null };
	}

	return {
		assigneeId,
		nextStepOwnerId: change.nextStepOwnerId === undefined ? assigneeId : change.nextStepOwnerId
	};
}

/**
 * User IDs that a change newly assigns. Only these must belong to active users;
 * an inactive user who already holds a field may keep it.
 */
export function newlyAssignedUserIds(before: TicketOwnership, after: TicketOwnership): string[] {
	const ids = new Set<string>();

	if (after.assigneeId !== null && after.assigneeId !== before.assigneeId) {
		ids.add(after.assigneeId);
	}

	if (after.nextStepOwnerId !== null && after.nextStepOwnerId !== before.nextStepOwnerId) {
		ids.add(after.nextStepOwnerId);
	}

	return [...ids];
}
