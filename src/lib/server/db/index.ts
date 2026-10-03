import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { logger } from '$lib/server/logger';

import { serverConfig } from '$lib/server/env';

const pool = new Pool({
	connectionString: serverConfig.DATABASE_URL,
	max: 5,
	connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
	logger.error('unexpected database pool error', { err });
});

export const db = drizzle({ client: pool });
