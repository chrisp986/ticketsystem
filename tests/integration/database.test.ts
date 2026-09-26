import { afterAll, expect, test } from 'vitest';
import { testPool } from './helpers/db';

afterAll(async () => {
	await testPool.end();
});

test('connects to the isolated test database', async () => {
	const result = await testPool.query<{
		database_name: string;
		database_user: string;
	}>(
		`SELECT
			current_database() AS database_name,
			current_user AS database_user`
	);

	expect(result.rows[0]).toEqual({
		database_name: 'ticketsystem_test',
		database_user: 'ticketsystem_test'
	});
});
