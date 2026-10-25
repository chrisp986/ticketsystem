import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { ticketAssignmentHistory } from '../../../src/lib/server/db/schema/ticket-assignment-history';
import { ticketAttentionEvents } from '../../../src/lib/server/db/schema/ticket-attention-events';
import { ticketStatusHistory } from '../../../src/lib/server/db/schema/ticket-status-history';
import { tickets } from '../../../src/lib/server/db/schema/tickets';
import { users } from '../../../src/lib/server/db/schema/users';
import { getTestDatabaseUrl } from './test-database-url';

export const testPool = new Pool({
	connectionString: getTestDatabaseUrl(),
	max: 1,
	connectionTimeoutMillis: 5000
});

export const testDb = drizzle({ client: testPool });

/**
 * The creator of tickets that tests insert directly, bypassing `createTicket` (ADR 0009).
 */
export const testCreator = { createdByType: 'system', createdByName: 'integration-test' } as const;

/**
 * Deletes a test ticket together with its attention events, status and assignment history.
 *
 * They reference the ticket with `restrict`, so they must be deleted first.
 */
export async function deleteTestTicket(ticketId: string) {
	await testDb
		.delete(ticketAssignmentHistory)
		.where(eq(ticketAssignmentHistory.ticketId, ticketId));
	await testDb.delete(ticketAttentionEvents).where(eq(ticketAttentionEvents.ticketId, ticketId));
	await testDb.delete(ticketStatusHistory).where(eq(ticketStatusHistory.ticketId, ticketId));
	await testDb.delete(tickets).where(eq(tickets.id, ticketId));
}

/**
 * Inserts a user without hashing a password; these users never sign in.
 */
export async function insertTestUser(values: { name?: string; active?: boolean } = {}) {
	const [user] = await testDb
		.insert(users)
		.values({
			email: `agent-${crypto.randomUUID()}@example.com`,
			name: values.name ?? 'Test Agent',
			passwordHash: 'not a real hash',
			active: values.active ?? true
		})
		.returning();

	if (!user) {
		throw new Error('Test user was not created.');
	}

	return user;
}

/**
 * Deletes test users. Delete their tickets first, which reference them with `restrict`.
 */
export async function deleteTestUsers(userIds: string[]) {
	if (userIds.length > 0) {
		await testDb.delete(users).where(inArray(users.id, userIds));
	}
}
