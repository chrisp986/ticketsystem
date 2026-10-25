import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { assignmentFields } from '$lib/modules/tickets/ticket.constants';

import { actorCheck, actorColumns } from './actor';
import { tickets } from './tickets';
import { users } from './users';

export const assignmentField = pgEnum('assignment_field', assignmentFields);

/**
 * Every change of a ticket's assignee or next-step owner (ADR 0008).
 */
export const ticketAssignmentHistory = pgTable(
	'ticket_assignment_history',
	{
		id: uuid('id').defaultRandom().primaryKey(),

		ticketId: uuid('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'restrict' }),

		field: assignmentField('field').notNull(),

		previousUserId: uuid('previous_user_id').references(() => users.id, { onDelete: 'restrict' }),

		newUserId: uuid('new_user_id').references(() => users.id, { onDelete: 'restrict' }),

		...actorColumns(),

		changedAt: timestamp('changed_at', {
			withTimezone: true,
			mode: 'date'
		})
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('ticket_assignment_history_ticket_id_changed_at_idx').on(table.ticketId, table.changedAt),
		check(
			'ticket_assignment_history_user_changed',
			sql`${table.previousUserId} IS DISTINCT FROM ${table.newUserId}`
		),
		actorCheck(
			'ticket_assignment_history_actor_valid',
			table.actorType,
			table.actorId,
			table.actorName
		)
	]
);

export type TicketAssignmentHistoryRecord = typeof ticketAssignmentHistory.$inferSelect;
