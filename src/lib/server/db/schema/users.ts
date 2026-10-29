import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { notBlank } from './not-blank';

/**
 * Agents who can sign in (ADR 0007).
 */
export const users = pgTable(
	'users',
	{
		id: uuid('id').defaultRandom().primaryKey(),

		email: text('email').notNull(),

		name: text('name').notNull(),

		passwordHash: text('password_hash').notNull(),

		active: boolean('active').default(true).notNull(),

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
			.notNull()
	},
	(table) => [
		uniqueIndex('users_email_unique').on(table.email),
		check('users_email_lower_case', sql`${table.email} = lower(${table.email})`),
		check('users_name_not_blank', notBlank(table.name))
	]
);

export type UserRecord = typeof users.$inferSelect;
