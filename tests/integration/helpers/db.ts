import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { getTestDatabaseUrl } from './test-database-url';

export const testPool = new Pool({
	connectionString: getTestDatabaseUrl(),
	max: 1,
	connectionTimeoutMillis: 5000
});

export const testDb = drizzle({ client: testPool });
