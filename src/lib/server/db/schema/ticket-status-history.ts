import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { actorCheck, actorColumns } from './actor';
import { ticketResolution, tickets, ticketStatus } from './tickets';

export const ticketStatusHistory = pgTable(
	'ticket_status_history',
	{
		id: uuid('id').defaultRandom().primaryKey(),

		ticketId: uuid('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'restrict' }),

		previousStatus: ticketStatus('previous_status').notNull(),

		newStatus: ticketStatus('new_status').notNull(),

		...actorColumns(),

		reason: text('reason'),

		resolution: ticketResolution('resolution'),

		resolutionSummary: text('resolution_summary'),

		changedAt: timestamp('changed_at', {
			withTimezone: true,
			mode: 'date'
		})
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('ticket_status_history_ticket_id_changed_at_idx').on(table.ticketId, table.changedAt),
		actorCheck('ticket_status_history_actor_valid', table.actorType, table.actorId, table.actorName)
	]
);

export type TicketStatusHistoryRecord = typeof ticketStatusHistory.$inferSelect;
