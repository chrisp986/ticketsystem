import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { ticketAttentionEvents } from '../../../src/lib/server/db/schema/ticket-attention-events';
import { ticketStatusHistory } from '../../../src/lib/server/db/schema/ticket-status-history';
import { tickets } from '../../../src/lib/server/db/schema/tickets';
import { getTestDatabaseUrl } from './test-database-url';

export const testPool = new Pool({
	connectionString: getTestDatabaseUrl(),
	max: 1,
	connectionTimeoutMillis: 5000
});

export const testDb = drizzle({ client: testPool });

/**
 * Deletes a test ticket together with its attention events and status history.
 *
 * Both reference the ticket with `restrict`, so they must be deleted first.
 */
export async function deleteTestTicket(ticketId: string) {
	await testDb.delete(ticketAttentionEvents).where(eq(ticketAttentionEvents.ticketId, ticketId));
	await testDb.delete(ticketStatusHistory).where(eq(ticketStatusHistory.ticketId, ticketId));
	await testDb.delete(tickets).where(eq(tickets.id, ticketId));
}
