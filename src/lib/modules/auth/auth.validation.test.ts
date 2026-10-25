import { expect, test } from 'vitest';

import { createUserSchema, loginSchema, safeRedirectTarget } from './auth.validation';

test('emails are trimmed and stored in lower case', () => {
	const result = loginSchema.parse({ email: '  Agent@Example.COM ', password: 'x' });

	expect(result.email).toBe('agent@example.com');
});

test.each(['', 'agent', 'agent@', '@example.com'])('%j is not a valid email', (email) => {
	expect(loginSchema.safeParse({ email, password: 'x' }).success).toBe(false);
});

test('a new password needs at least 12 characters', () => {
	const base = { email: 'agent@example.com', name: 'Agent' };

	expect(createUserSchema.safeParse({ ...base, password: 'a'.repeat(11) }).success).toBe(false);
	expect(createUserSchema.safeParse({ ...base, password: 'a'.repeat(12) }).success).toBe(true);
});

test('passwords longer than 256 characters are rejected', () => {
	const result = loginSchema.safeParse({ email: 'agent@example.com', password: 'a'.repeat(257) });

	expect(result.success).toBe(false);
});

test('a blank name is rejected', () => {
	const result = createUserSchema.safeParse({
		email: 'agent@example.com',
		name: '   ',
		password: 'a'.repeat(12)
	});

	expect(result.success).toBe(false);
});

test.each([
	['/tickets/1?view=all', '/tickets/1?view=all'],
	['/', '/'],
	[null, '/'],
	['', '/'],
	['https://evil.example', '/'],
	['//evil.example', '/'],
	['/\\evil.example', '/'],
	['tickets', '/']
])('redirect target %j becomes %j', (value, expected) => {
	expect(safeRedirectTarget(value)).toBe(expected);
});
