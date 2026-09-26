import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: {
		url: 'postgresql://ticketsystem_test:local_test_only@127.0.0.1:5433/ticketsystem_test'
	}
});
