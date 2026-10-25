import { eq } from 'drizzle-orm';
import { afterAll, afterEach, expect, test } from 'vitest';

import {
	SESSION_DURATION_MS,
	createSession,
	hashSessionToken,
	invalidateSession,
	validateSessionToken
} from '../../src/lib/server/auth/session';
import { authenticate, createUser } from '../../src/lib/server/auth/users';
import { sessions } from '../../src/lib/server/db/schema/sessions';
import { users } from '../../src/lib/server/db/schema/users';
import { testDb, testPool } from './helpers/db';

const DAY_MS = 24 * 60 * 60 * 1000;
const password = 'correct horse battery';

const createdUserIds: string[] = [];

afterEach(async () => {
	for (const id of createdUserIds.splice(0)) {
		await testDb.delete(users).where(eq(users.id, id));
	}
});

afterAll(async () => {
	await testPool.end();
});

async function createTestUser(email = `agent-${crypto.randomUUID()}@example.com`) {
	const user = await createUser(testDb, { email, name: 'Test Agent', password });

	if (user === 'email_taken') {
		throw new Error('Test user was not created.');
	}

	createdUserIds.push(user.id);
	return user;
}

test('a created user stores a password hash, never the password', async () => {
	const user = await createTestUser();

	const [stored] = await testDb.select().from(users).where(eq(users.id, user.id));

	expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
	expect(stored?.passwordHash).not.toContain(password);
	expect(stored?.active).toBe(true);
});

test('an email can only be used once', async () => {
	const user = await createTestUser();

	const second = await createUser(testDb, { email: user.email, name: 'Other', password });

	expect(second).toBe('email_taken');
});

test('the database rejects emails that are not lower case', async () => {
	await expect(
		testDb.insert(users).values({ email: 'Agent@Example.com', name: 'Agent', passwordHash: 'x' })
	).rejects.toThrow();
});

test('the right password signs in', async () => {
	const user = await createTestUser();

	await expect(authenticate(testDb, user.email, password)).resolves.toEqual(user);
});

test('a wrong password, an unknown email and an inactive user all fail', async () => {
	const user = await createTestUser();
	const inactive = await createTestUser();

	await testDb.update(users).set({ active: false }).where(eq(users.id, inactive.id));

	await expect(authenticate(testDb, user.email, 'wrong password!')).resolves.toBeNull();
	await expect(authenticate(testDb, 'nobody@example.com', password)).resolves.toBeNull();
	await expect(authenticate(testDb, inactive.email, password)).resolves.toBeNull();
});

test('a session stores only the hash of its token', async () => {
	const user = await createTestUser();

	const { token } = await createSession(testDb, user.id);

	const stored = await testDb.select().from(sessions).where(eq(sessions.userId, user.id));

	expect(stored).toHaveLength(1);
	expect(stored[0]?.id).toBe(hashSessionToken(token));
	expect(stored[0]?.id).not.toBe(token);
});

test('a valid token returns its user', async () => {
	const user = await createTestUser();
	const now = new Date();

	const { token, expiresAt } = await createSession(testDb, user.id, now);

	await expect(validateSessionToken(testDb, token, now)).resolves.toEqual({
		user,
		expiresAt,
		renewed: false
	});
});

test('an unknown token is rejected', async () => {
	await expect(validateSessionToken(testDb, 'unknown')).resolves.toBeNull();
});

test('an expired session is rejected and deleted', async () => {
	const user = await createTestUser();
	const now = new Date();

	const { token } = await createSession(testDb, user.id, now);
	const later = new Date(now.getTime() + SESSION_DURATION_MS);

	await expect(validateSessionToken(testDb, token, later)).resolves.toBeNull();

	const stored = await testDb.select().from(sessions).where(eq(sessions.userId, user.id));

	expect(stored).toEqual([]);
});

test('a session with less than 15 days left is extended', async () => {
	const user = await createTestUser();
	const now = new Date();

	const { token } = await createSession(testDb, user.id, now);
	const later = new Date(now.getTime() + 20 * DAY_MS);

	const result = await validateSessionToken(testDb, token, later);

	expect(result?.renewed).toBe(true);
	expect(result?.expiresAt).toEqual(new Date(later.getTime() + SESSION_DURATION_MS));

	const [stored] = await testDb.select().from(sessions).where(eq(sessions.userId, user.id));

	expect(stored?.expiresAt).toEqual(result?.expiresAt);
});

test('deactivating a user ends their sessions', async () => {
	const user = await createTestUser();

	const { token } = await createSession(testDb, user.id);

	await testDb.update(users).set({ active: false }).where(eq(users.id, user.id));

	await expect(validateSessionToken(testDb, token)).resolves.toBeNull();
});

test('signing out deletes the session', async () => {
	const user = await createTestUser();

	const { token } = await createSession(testDb, user.id);

	await invalidateSession(testDb, token);

	await expect(validateSessionToken(testDb, token)).resolves.toBeNull();
});
