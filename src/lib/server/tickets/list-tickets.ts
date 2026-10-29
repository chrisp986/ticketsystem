import { and, asc, desc, eq, ilike, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { ticketViews } from '../../modules/tickets/ticket.constants';
import type { TicketStatus, TicketView } from '../../modules/tickets/ticket.types';
import { tickets } from '../db/schema/tickets';

export type ListTicketsInput = {
	status?: TicketStatus;
	searchTerm: string;
	view: TicketView;
	currentUserId: string;
	page: number;
	pageSize: number;
};

/**
 * Which tickets a view shows (ADR 0008). The personal views and "unassigned"
 * show open tickets only; overdue tickets are open, since closed ones have no due date.
 *
 * The next step is mine when I own it, or when nobody does and I am the assignee.
 */
function viewCondition(view: TicketView, currentUserId: string, now: Date): SQL | undefined {
	const open = ne(tickets.status, 'closed');
	const needsAttention = isNotNull(tickets.attentionSince);
	const overdue = lt(tickets.nextStepDue, now);

	switch (view) {
		case 'mine':
			return and(
				open,
				or(eq(tickets.assigneeId, currentUserId), eq(tickets.nextStepOwnerId, currentUserId))
			);
		case 'my_overdue':
			return and(
				overdue,
				eq(sql`coalesce(${tickets.nextStepOwnerId}, ${tickets.assigneeId})`, currentUserId)
			);
		case 'unassigned':
			return and(open, isNull(tickets.assigneeId));
		case 'action':
			return or(needsAttention, overdue);
		case 'attention':
			return needsAttention;
		case 'overdue':
			return overdue;
		case 'all':
			return undefined;
	}
}

/**
 * Lists tickets for the work queue.
 *
 * "all" is sorted newest first. Every other view is sorted by how long
 * a ticket has been waiting: attention time, otherwise next-step due date.
 */
export async function listTickets(
	database: NodePgDatabase,
	input: ListTicketsInput,
	now: Date = new Date()
) {
	const { status, searchTerm, view, currentUserId, page, pageSize } = input;

	// Treat user-entered backslashes, percent signs, and underscores literally.
	const escapedSearchTerm = searchTerm.replace(/[\\%_]/g, (character) => `\\${character}`);

	const waitingSince = sql`coalesce(${tickets.attentionSince}, ${tickets.nextStepDue})`;

	const rows = await database
		.select()
		.from(tickets)
		.where(
			and(
				status === undefined ? undefined : eq(tickets.status, status),
				searchTerm === '' ? undefined : ilike(tickets.subject, `%${escapedSearchTerm}%`),
				viewCondition(view, currentUserId, now)
			)
		)
		.orderBy(
			...(view === 'all'
				? [desc(tickets.createdAt), desc(tickets.id)]
				: [asc(waitingSince), asc(tickets.id)])
		)
		.limit(pageSize + 1)
		.offset((page - 1) * pageSize);

	return {
		tickets: rows.slice(0, pageSize),
		hasNextPage: rows.length > pageSize
	};
}

/**
 * How many tickets each view holds, ignoring the status filter and search. One query.
 */
export async function countTicketViews(
	database: NodePgDatabase,
	currentUserId: string,
	now: Date = new Date()
): Promise<Record<TicketView, number>> {
	const counts = Object.fromEntries(
		ticketViews.map((view) => {
			const condition = viewCondition(view, currentUserId, now);

			return [
				view,
				condition
					? sql<number>`count(*) filter (where ${condition})`.mapWith(Number)
					: sql<number>`count(*)`.mapWith(Number)
			];
		})
	) as Record<TicketView, SQL.Aliased<number> | SQL<number>>;

	const [row] = await database.select(counts).from(tickets);

	if (!row) {
		throw new Error('Counting tickets returned no row.');
	}

	return row as Record<TicketView, number>;
}
