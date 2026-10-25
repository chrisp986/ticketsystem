import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { attentionClearTypes, attentionEventTypes } from '$lib/modules/tickets/ticket.constants';

import { actorCheck, actorColumns } from './actor';
import { attentionReason, tickets } from './tickets';

export const attentionEventType = pgEnum('attention_event_type', attentionEventTypes);

export const attentionClearType = pgEnum('attention_clear_type', attentionClearTypes);

/**
 * Every time attention is raised or cleared (ADR 0002).
 */
export const ticketAttentionEvents = pgTable(
	'ticket_attention_events',
	{
		id: uuid('id').defaultRandom().primaryKey(),

		ticketId: uuid('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'restrict' }),

		eventType: attentionEventType('event_type').notNull(),

		reason: attentionReason('reason').notNull(),

		clearType: attentionClearType('clear_type'),

		...actorColumns(),

		occurredAt: timestamp('occurred_at', {
			withTimezone: true,
			mode: 'date'
		})
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('ticket_attention_events_ticket_id_occurred_at_idx').on(table.ticketId, table.occurredAt),
		check(
			'ticket_attention_events_clear_type_only_when_cleared',
			sql`(${table.eventType} = 'cleared') = (${table.clearType} IS NOT NULL)`
		),
		actorCheck(
			'ticket_attention_events_actor_valid',
			table.actorType,
			table.actorId,
			table.actorName
		)
	]
);

export type TicketAttentionEventRecord = typeof ticketAttentionEvents.$inferSelect;
