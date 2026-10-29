import { desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { assignmentFields } from '../../modules/tickets/ticket.constants';
import type {
	Actor,
	AssignmentField,
	AttentionClearType,
	AttentionEventType,
	AttentionReason,
	TicketNoteKind,
	TicketResolution,
	TicketStatus
} from '../../modules/tickets/ticket.types';
import { ticketAssignmentHistory } from '../db/schema/ticket-assignment-history';
import { ticketAttentionEvents } from '../db/schema/ticket-attention-events';
import { ticketNotes } from '../db/schema/ticket-notes';
import { ticketStatusHistory } from '../db/schema/ticket-status-history';
import type { TicketRecord } from '../db/schema/tickets';
import { actorFromFields } from './actor-fields';

type EntryBase = { id: string; at: Date; actor: Actor };

export type TimelineEntry =
	| (EntryBase & { kind: 'created' })
	| (EntryBase & { kind: 'note'; noteKind: TicketNoteKind; body: string })
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
 * the ticket, then a note explaining the change, then the status change and
 * its ownership and attention effects.
 */
const kindOrder: Record<TimelineEntry['kind'], number> = {
	created: 0,
	note: 1,
	status: 2,
	assignment: 3,
	attention: 4
};

/**
 * Position of an entry within its transaction. Assignment rows follow the order
 * `recordOwnershipChanges` writes them in: assignee, then next-step owner.
 */
function writeOrder(entry: TimelineEntry): number {
	const fieldOrder = entry.kind === 'assignment' ? assignmentFields.indexOf(entry.field) : 0;

	return kindOrder[entry.kind] * assignmentFields.length + fieldOrder;
}

/**
 * The most recent entries of a ticket's timeline, newest first (ADR 0005, ADR 0009).
 */
export async function loadTicketTimeline(
	database: NodePgDatabase,
	ticket: Pick<TicketRecord, 'id' | 'createdAt' | 'createdByType' | 'createdById' | 'createdByName'>
): Promise<TimelineEntry[]> {
	const [noteRows, statusRows, attentionRows, assignmentRows] = await Promise.all([
		database
			.select()
			.from(ticketNotes)
			.where(eq(ticketNotes.ticketId, ticket.id))
			.orderBy(desc(ticketNotes.createdAt), desc(ticketNotes.id))
			.limit(TIMELINE_LIMIT),
		database
			.select()
			.from(ticketStatusHistory)
			.where(eq(ticketStatusHistory.ticketId, ticket.id))
			.orderBy(desc(ticketStatusHistory.changedAt), desc(ticketStatusHistory.id))
			.limit(TIMELINE_LIMIT),
		database
			.select()
			.from(ticketAttentionEvents)
			.where(eq(ticketAttentionEvents.ticketId, ticket.id))
			.orderBy(desc(ticketAttentionEvents.occurredAt), desc(ticketAttentionEvents.id))
			.limit(TIMELINE_LIMIT),
		database
			.select()
			.from(ticketAssignmentHistory)
			.where(eq(ticketAssignmentHistory.ticketId, ticket.id))
			.orderBy(desc(ticketAssignmentHistory.changedAt), desc(ticketAssignmentHistory.id))
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
		...noteRows.map((row) => ({
			kind: 'note' as const,
			id: row.id,
			at: row.createdAt,
			actor: { type: 'user' as const, id: row.authorId },
			noteKind: row.kind,
			body: row.body
		})),
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
		.sort(
			(a, b) =>
				b.at.getTime() - a.at.getTime() ||
				writeOrder(b) - writeOrder(a) ||
				(a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
		)
		.slice(0, TIMELINE_LIMIT);
}
