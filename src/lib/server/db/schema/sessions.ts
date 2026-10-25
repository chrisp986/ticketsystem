import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './users';

/**
 * Signed-in browser sessions (ADR 0007).
 *
 * The ID is the SHA-256 hash of the cookie token, never the token itself.
 */
export const sessions = pgTable(
	'sessions',
	{
		id: text('id').primaryKey(),

		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),

		expiresAt: timestamp('expires_at', {
			withTimezone: true,
			mode: 'date'
		}).notNull(),

		createdAt: timestamp('created_at', {
			withTimezone: true,
			mode: 'date'
		})
			.defaultNow()
			.notNull()
	},
	(table) => [index('sessions_user_id_idx').on(table.userId)]
);

export type SessionRecord = typeof sessions.$inferSelect;
