import { expect, test } from 'vitest';

import { parseServerConfig } from './config';

const validUrl = 'postgresql://user:secret-password@127.0.0.1:5432/ticketsystem';

test('accepts a valid configuration and defaults LOG_LEVEL to info', () => {
	expect(parseServerConfig({ DATABASE_URL: validUrl })).toEqual({
		DATABASE_URL: validUrl,
		LOG_LEVEL: 'info'
	});
});

test('rejects a missing DATABASE_URL', () => {
	expect(() => parseServerConfig({})).toThrow(/DATABASE_URL/);
});

test('rejects a non-postgres DATABASE_URL', () => {
	expect(() => parseServerConfig({ DATABASE_URL: 'mysql://user:pw@host/db' })).toThrow(
		/DATABASE_URL/
	);
});

test('rejects an unknown LOG_LEVEL', () => {
	expect(() => parseServerConfig({ DATABASE_URL: validUrl, LOG_LEVEL: 'verbose' })).toThrow(
		/LOG_LEVEL/
	);
});

test('does not include secrets in the error message', () => {
	expect(() => parseServerConfig({ DATABASE_URL: 'mysql://user:secret-password@host/db' })).toThrow(
		expect.not.objectContaining({ message: expect.stringContaining('secret-password') })
	);
});
