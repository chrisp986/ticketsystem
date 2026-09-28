const defaultUrl =
	'postgresql://ticketsystem_test:local_test_only@127.0.0.1:5433/ticketsystem_test';

export function getTestDatabaseUrl(): string {
	const url = process.env.TEST_DATABASE_URL ?? defaultUrl;
	const databaseName = new URL(url).pathname.slice(1);

	if (!databaseName.endsWith('_test')) {
		throw new Error(`Refusing to use "${databaseName}" as test database (name must end in _test).`);
	}

	return url;
}
