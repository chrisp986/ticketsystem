import { sql } from 'drizzle-orm';

import { index, integer, pgEnum, pgTable, text, timestamp, uuid, check } from 'drizzle-orm/pg-core';

import {
	ticketPriorities,
	ticketSources,
	ticketStatuses,
	ticketResolutions
} from '$lib/modules/tickets/ticket.constants';

/**
 * PostgreSQL enum definitions.
 *
 * These must be declared outside pgTable().
 */

export const ticketStatus = pgEnum('ticket_status', ticketStatuses);

export const ticketPriority = pgEnum('ticket_priority', ticketPriorities);

export const ticketSource = pgEnum('ticket_source', ticketSources);

export const ticketResolution = pgEnum('ticket_resolution', ticketResolutions);

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

		resolution: ticketResolution('resolution'),

		resolutionSummary: text('resolution_summary'),

		firstResolvedAt: timestamp('first_resolved_at', {
			withTimezone: true,
			mode: 'date'
		}),

		reopenCount: integer('reopen_count').default(0).notNull(),

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

		index('tickets_priority_status_idx').on(table.priority, table.status),

		check(
			'tickets_closed_at_matches_status',
			sql`(${table.status} = 'closed') = (${table.closedAt} IS NOT NULL)`
		),
		check(
			'tickets_resolved_status_has_resolved_at',
			sql`${table.status} <> 'resolved' OR ${table.resolvedAt} IS NOT NULL`
		),
		check(
			'tickets_resolved_at_only_when_resolved_or_closed',
			sql`${table.status} IN ('resolved', 'closed') OR ${table.resolvedAt} IS NULL`
		),
		check('tickets_reopen_count_not_negative', sql`${table.reopenCount} >= 0`),
		check(
			'tickets_resolved_at_has_first_resolved_at',
			sql`${table.resolvedAt} IS NULL OR ${table.firstResolvedAt} IS NOT NULL`
		)
	]
);

/**
 * Database types.
 */

export type TicketRecord = typeof tickets.$inferSelect;

export type NewTicketRecord = typeof tickets.$inferInsert;
