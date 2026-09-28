import { defineConfig } from 'drizzle-kit';
import { getTestDatabaseUrl } from './tests/integration/helpers/test-database-url';

export default defineConfig({
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: { url: getTestDatabaseUrl() }
});
