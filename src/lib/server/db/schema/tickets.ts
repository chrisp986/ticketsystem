import { sql } from 'drizzle-orm';

import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Business lifecycle of a ticket.
 *
 * AI execution states are managed separately.
 */
export const ticketStatus = pgEnum('ticket_status', [
	'new',
	'in_progress',
	'waiting_customer',
	'waiting_internal',
	'resolved',
	'closed'
]);

/**
 * Business priority.
 *
 * AI agents may recommend priority changes,
 * but authorization is handled by the application.
 */
export const ticketPriority = pgEnum('ticket_priority', ['low', 'medium', 'high', 'critical']);

/**
 * Channel through which the ticket was created.
 */
export const ticketSource = pgEnum('ticket_source', ['manual', 'email', 'web', 'api']);

export const tickets = pgTable(
	'tickets',
	{
		// Internal identifier
		id: uuid('id').defaultRandom().primaryKey(),

		// Business information
		subject: text('subject').notNull(),

		description: text('description'),

		// Ticket lifecycle
		status: ticketStatus('status').default('new').notNull(),

		// Ticket importance
		priority: ticketPriority('priority').default('medium').notNull(),

		// Origin of the ticket
		source: ticketSource('source').default('manual').notNull(),

		// Simple initial categorization
		tags: text('tags')
			.array()
			.default(sql`'{}'::text[]`)
			.notNull(),

		/**
		 * Optimistic concurrency control.
		 *
		 * Application updates must increment this
		 * value and check the previous version.
		 */
		version: integer('version').default(1).notNull(),

		// Lifecycle timestamps
		resolvedAt: timestamp('resolved_at', {
			withTimezone: true,
			mode: 'date'
		}),

		closedAt: timestamp('closed_at', {
			withTimezone: true,
			mode: 'date'
		}),

		// Audit timestamps
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

	// Indexes for common ticket queries
	(table) => [
		index('tickets_status_created_at_idx').on(table.status, table.createdAt),

		index('tickets_priority_status_idx').on(table.priority, table.status)
	]
);

// TypeScript types derived from the schema

export type Ticket = typeof tickets.$inferSelect;

export type NewTicket = typeof tickets.$inferInsert;
