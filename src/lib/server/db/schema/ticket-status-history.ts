import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { actorTypes } from '$lib/modules/tickets/ticket.constants';

import { ticketResolution, tickets, ticketStatus } from './tickets';

export const actorType = pgEnum('actor_type', actorTypes);

export const ticketStatusHistory = pgTable(
	'ticket_status_history',
	{
		id: uuid('id').defaultRandom().primaryKey(),

		ticketId: uuid('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'restrict' }),

		previousStatus: ticketStatus('previous_status').notNull(),

		newStatus: ticketStatus('new_status').notNull(),

		actorType: actorType('actor_type').notNull(),

		actorId: text('actor_id'),

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
		index('ticket_status_history_ticket_id_changed_at_idx').on(table.ticketId, table.changedAt)
	]
);

export type TicketStatusHistoryRecord = typeof ticketStatusHistory.$inferSelect;
