import { sql } from 'drizzle-orm';
import { check, pgEnum, text, uuid } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { actorTypes } from '$lib/modules/tickets/ticket.constants';

import { users } from './users';

export const actorType = pgEnum('actor_type', actorTypes);

/**
 * The actor of a history row: a user ID for people, a name for system and AI actors (ADR 0009).
 */
export function actorColumns() {
	return {
		actorType: actorType('actor_type').notNull(),

		actorId: uuid('actor_id').references(() => users.id, { onDelete: 'restrict' }),

		actorName: text('actor_name')
	};
}

/**
 * Enforces ADR 0009: a user actor has an ID and no name, any other actor a short
 * lower-case name and no ID.
 */
export function actorCheck(
	name: string,
	type: AnyPgColumn,
	id: AnyPgColumn,
	actorName: AnyPgColumn
) {
	return check(
		name,
		sql`(${type} = 'user' AND ${id} IS NOT NULL AND ${actorName} IS NULL) OR (${type} <> 'user' AND ${id} IS NULL AND ${actorName} IS NOT NULL AND btrim(${actorName}) <> '' AND ${actorName} = lower(${actorName}) AND char_length(${actorName}) <= 100)`
	);
}
