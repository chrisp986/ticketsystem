import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { tickets, ticketStatus } from './tickets';

export const ticketStatusHistory = pgTable(
	'ticket_status_history',
	{
		id: uuid('id').defaultRandom().primaryKey(),

		ticketId: uuid('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'cascade' }),

		previousStatus: ticketStatus('previous_status').notNull(),

		newStatus: ticketStatus('new_status').notNull(),

		changedAt: timestamp('changed_at', {
			withTimezone: true,
			mode: 'date'
		})
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('ticket_status_history_ticket_id_changed_at_idx').on(table.ticketId, table.changedAt)
	]
);

export type TicketStatusHistoryRecord = typeof ticketStatusHistory.$inferSelect;
