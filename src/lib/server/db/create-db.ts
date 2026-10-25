import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { logger } from '../logger';

/**
 * Creates a connection pool and database client.
 *
 * Framework-neutral, so scripts and the worker can use it (ADR 0003).
 */
export function createDb(connectionString: string, max = 5) {
	const pool = new Pool({ connectionString, max, connectionTimeoutMillis: 5000 });

	pool.on('error', (err) => {
		logger.error('unexpected database pool error', { err });
	});

	return { db: drizzle({ client: pool }), pool };
}
