import { desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type {
	Actor,
	AssignmentField,
	AttentionClearType,
	AttentionEventType,
	AttentionReason,
	TicketResolution,
	TicketStatus
} from '../../modules/tickets/ticket.types';
import { ticketAssignmentHistory } from '../db/schema/ticket-assignment-history';
import { ticketAttentionEvents } from '../db/schema/ticket-attention-events';
import { ticketStatusHistory } from '../db/schema/ticket-status-history';
import type { TicketRecord } from '../db/schema/tickets';
import { actorFromFields } from './actor-fields';

type EntryBase = { id: string; at: Date; actor: Actor };

export type TimelineEntry =
	| (EntryBase & { kind: 'created' })
	| (EntryBase & {
			kind: 'status';
			previousStatus: TicketStatus;
			newStatus: TicketStatus;
			reason: string | null;
			resolution: TicketResolution | null;
			resolutionSummary: string | null;
	  })
	| (EntryBase & {
			kind: 'attention';
			eventType: AttentionEventType;
			reason: AttentionReason;
			clearType: AttentionClearType | null;
	  })
	| (EntryBase & {
			kind: 'assignment';
			field: AssignmentField;
			previousUserId: string | null;
			newUserId: string | null;
	  });

export const TIMELINE_LIMIT = 50;

/**
 * Order of entries written in the same transaction, which share a timestamp:
 * the ticket or status change first, then its ownership and attention effects.
 */
const kindOrder: Record<TimelineEntry['kind'], number> = {
	created: 0,
	status: 1,
	assignment: 2,
	attention: 3
};

/**
 * The most recent entries of a ticket's timeline, newest first (ADR 0009).
 */
export async function loadTicketTimeline(
	database: NodePgDatabase,
	ticket: Pick<TicketRecord, 'id' | 'createdAt' | 'createdByType' | 'createdById' | 'createdByName'>
): Promise<TimelineEntry[]> {
	const [statusRows, attentionRows, assignmentRows] = await Promise.all([
		database
			.select()
			.from(ticketStatusHistory)
			.where(eq(ticketStatusHistory.ticketId, ticket.id))
			.orderBy(desc(ticketStatusHistory.changedAt))
			.limit(TIMELINE_LIMIT),
		database
			.select()
			.from(ticketAttentionEvents)
			.where(eq(ticketAttentionEvents.ticketId, ticket.id))
			.orderBy(desc(ticketAttentionEvents.occurredAt))
			.limit(TIMELINE_LIMIT),
		database
			.select()
			.from(ticketAssignmentHistory)
			.where(eq(ticketAssignmentHistory.ticketId, ticket.id))
			.orderBy(desc(ticketAssignmentHistory.changedAt))
			.limit(TIMELINE_LIMIT)
	]);

	const entries: TimelineEntry[] = [
		{
			kind: 'created',
			id: ticket.id,
			at: ticket.createdAt,
			actor: actorFromFields({
				actorType: ticket.createdByType,
				actorId: ticket.createdById,
				actorName: ticket.createdByName
			})
		},
		...statusRows.map((row) => ({
			kind: 'status' as const,
			id: row.id,
			at: row.changedAt,
			actor: actorFromFields(row),
			previousStatus: row.previousStatus,
			newStatus: row.newStatus,
			reason: row.reason,
			resolution: row.resolution,
			resolutionSummary: row.resolutionSummary
		})),
		...attentionRows.map((row) => ({
			kind: 'attention' as const,
			id: row.id,
			at: row.occurredAt,
			actor: actorFromFields(row),
			eventType: row.eventType,
			reason: row.reason,
			clearType: row.clearType
		})),
		...assignmentRows.map((row) => ({
			kind: 'assignment' as const,
			id: row.id,
			at: row.changedAt,
			actor: actorFromFields(row),
			field: row.field,
			previousUserId: row.previousUserId,
			newUserId: row.newUserId
		}))
	];

	return entries
		.sort((a, b) => b.at.getTime() - a.at.getTime() || kindOrder[b.kind] - kindOrder[a.kind])
		.slice(0, TIMELINE_LIMIT);
}
