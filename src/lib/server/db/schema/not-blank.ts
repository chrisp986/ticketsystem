import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * True when the text has a character other than whitespace. `btrim` strips only
 * spaces, so `btrim(x) <> ''` would let text of newlines or tabs through.
 */
export function notBlank(column: AnyPgColumn): SQL {
	return sql`${column} ~ '[^[:space:]]'`;
}
