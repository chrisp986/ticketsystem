import { describe, expect, test } from 'vitest';

import { parseGmailConfig, parseServerConfig } from './config';

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

describe('parseGmailConfig', () => {
	const gmail = {
		GMAIL_CLIENT_ID: 'client-id',
		GMAIL_CLIENT_SECRET: 'client-secret',
		GMAIL_REFRESH_TOKEN: 'refresh-token',
		GMAIL_MAILBOX: 'support@example.com'
	};

	test('accepts complete settings', () => {
		expect(parseGmailConfig(gmail)).toEqual(gmail);
	});

	test('names missing settings without printing the others', () => {
		const error = (() => {
			try {
				parseGmailConfig({ ...gmail, GMAIL_REFRESH_TOKEN: undefined, GMAIL_MAILBOX: 'nope' });
			} catch (err) {
				return String(err);
			}
		})();

		expect(error).toContain('GMAIL_REFRESH_TOKEN');
		expect(error).toContain('GMAIL_MAILBOX');
		expect(error).not.toContain('client-secret');
		expect(error).not.toContain('nope');
	});
});
