import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const connectionString = env.DATABASE_URL;

if (!connectionString) {
	throw new Error('DATABASE_URL missing.');
}

const pool = new Pool({
	// Never actually connected to during the build's route-analysis step.
	connectionString: building ? 'postgresql://build:build@localhost:5432/build' : connectionString,
	max: 5,
	connectionTimeoutMillis: 5000
});

export const db = drizzle({ client: pool });
