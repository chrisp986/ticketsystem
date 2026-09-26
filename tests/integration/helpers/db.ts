import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export const testPool = new Pool({
	connectionString:
		'postgresql://ticketsystem_test:local_test_only@127.0.0.1:5433/ticketsystem_test',
	max: 1,
	connectionTimeoutMillis: 5000
});

export const testDb = drizzle({ client: testPool });
