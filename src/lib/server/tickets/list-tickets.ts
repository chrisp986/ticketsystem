import { and, asc, desc, eq, ilike, isNotNull, lt, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { TicketStatus, TicketView } from '../../modules/tickets/ticket.types';
import { tickets } from '../db/schema/tickets';

export type ListTicketsInput = {
	status?: TicketStatus;
	searchTerm: string;
	view: TicketView;
	page: number;
	pageSize: number;
};

/**
 * Lists tickets for the work queue.
 *
 * "all" is sorted newest first. The action views are sorted by how long
 * a ticket has been waiting: attention time, otherwise next-step due date.
 */
export async function listTickets(
	database: NodePgDatabase,
	input: ListTicketsInput,
	now: Date = new Date()
) {
	const { status, searchTerm, view, page, pageSize } = input;

	// Treat user-entered backslashes, percent signs, and underscores literally.
	const escapedSearchTerm = searchTerm.replace(/[\\%_]/g, (character) => `\\${character}`);

	const needsAttention = isNotNull(tickets.attentionSince);
	const overdue = lt(tickets.nextStepDue, now);

	const viewCondition =
		view === 'attention'
			? needsAttention
			: view === 'overdue'
				? overdue
				: view === 'action'
					? or(needsAttention, overdue)
					: undefined;

	const waitingSince = sql`coalesce(${tickets.attentionSince}, ${tickets.nextStepDue})`;

	const rows = await database
		.select()
		.from(tickets)
		.where(
			and(
				status === undefined ? undefined : eq(tickets.status, status),
				searchTerm === '' ? undefined : ilike(tickets.subject, `%${escapedSearchTerm}%`),
				viewCondition
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
