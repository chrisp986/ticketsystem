import { sql } from 'drizzle-orm';

import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import {
	ticketPriorities,
	ticketSources,
	ticketStatuses
} from '$lib/modules/tickets/ticket.constants';

/**
 * PostgreSQL enum definitions.
 *
 * These must be declared outside pgTable().
 */

export const ticketStatus = pgEnum('ticket_status', ticketStatuses);

export const ticketPriority = pgEnum('ticket_priority', ticketPriorities);

export const ticketSource = pgEnum('ticket_source', ticketSources);

/**
 * Tickets table.
 */

export const tickets = pgTable(
	'tickets',
	{
		id: uuid('id').defaultRandom().primaryKey(),

		ticketNumber: integer('ticket_number').generatedAlwaysAsIdentity().notNull().unique(),

		subject: text('subject').notNull(),

		description: text('description'),

		status: ticketStatus('status').default('new').notNull(),

		priority: ticketPriority('priority').default('medium').notNull(),

		source: ticketSource('source').default('manual').notNull(),

		tags: text('tags')
			.array()
			.default(sql`'{}'::text[]`)
			.notNull(),

		version: integer('version').default(1).notNull(),

		resolvedAt: timestamp('resolved_at', {
			withTimezone: true,
			mode: 'date'
		}),

		closedAt: timestamp('closed_at', {
			withTimezone: true,
			mode: 'date'
		}),

		createdAt: timestamp('created_at', {
			withTimezone: true,
			mode: 'date'
		})
			.defaultNow()
			.notNull(),

		updatedAt: timestamp('updated_at', {
			withTimezone: true,
			mode: 'date'
		})
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},

	(table) => [
		index('tickets_status_created_at_idx').on(table.status, table.createdAt),

		index('tickets_priority_status_idx').on(table.priority, table.status)
	]
);

/**
 * Database types.
 */

export type TicketRecord = typeof tickets.$inferSelect;

export type NewTicketRecord = typeof tickets.$inferInsert;
