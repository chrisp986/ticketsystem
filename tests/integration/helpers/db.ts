import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { tickets } from '../../../src/lib/server/db/schema/tickets';
import { ticketStatusHistory } from '../../../src/lib/server/db/schema/ticket-status-history';
import { getTestDatabaseUrl } from './test-database-url';

export const testPool = new Pool({
	connectionString: getTestDatabaseUrl(),
	max: 1,
	connectionTimeoutMillis: 5000
});

export const testDb = drizzle({ client: testPool });

/**
 * Deletes a test ticket and its history.
 *
 * The history references the ticket with `restrict`,
 * so it must be deleted first.
 */
export async function deleteTestTicket(ticketId: string) {
	await testDb.delete(ticketStatusHistory).where(eq(ticketStatusHistory.ticketId, ticketId));
	await testDb.delete(tickets).where(eq(tickets.id, ticketId));
}
