import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { TICKET_NOTE_MAX_LENGTH, ticketNoteKinds } from '$lib/modules/tickets/ticket.constants';

import { notBlank } from './not-blank';
import { tickets } from './tickets';
import { users } from './users';

export const ticketNoteKind = pgEnum('ticket_note_kind', ticketNoteKinds);

/**
 * Manual notes on a ticket, append-only (ADR 0005).
 */
export const ticketNotes = pgTable(
	'ticket_notes',
	{
		id: uuid('id').defaultRandom().primaryKey(),

		ticketId: uuid('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'restrict' }),

		kind: ticketNoteKind('kind').notNull(),

		body: text('body').notNull(),

		authorId: uuid('author_id')
			.notNull()
			.references(() => users.id, { onDelete: 'restrict' }),

		createdAt: timestamp('created_at', {
			withTimezone: true,
			mode: 'date'
		})
			.defaultNow()
			.notNull()
	},
	(table) => [
		index('ticket_notes_ticket_id_created_at_idx').on(table.ticketId, table.createdAt),
		check(
			'ticket_notes_body_valid',
			sql`${notBlank(table.body)} AND char_length(${table.body}) <= ${sql.raw(String(TICKET_NOTE_MAX_LENGTH))}`
		)
	]
);
