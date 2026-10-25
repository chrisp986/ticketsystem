import { expect, test } from 'vitest';

import { generateSessionToken, hashSessionToken } from './session';

test('session tokens are random and URL-safe', () => {
	const first = generateSessionToken();
	const second = generateSessionToken();

	expect(first).not.toBe(second);
	expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
});

test('the stored session ID is the SHA-256 hash of the token', () => {
	expect(hashSessionToken('token')).toBe(
		'3c469e9d6c5875d37a43f353d4f88e61fcf812c66eee3457465a40b0da4153e0'
	);
});
