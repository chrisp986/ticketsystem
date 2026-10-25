import { createHash, randomBytes } from 'node:crypto';

import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { sessions } from '../db/schema/sessions';
import { users } from '../db/schema/users';

export const SESSION_COOKIE = 'session';

const DAY_MS = 24 * 60 * 60 * 1000;

export const SESSION_DURATION_MS = 30 * DAY_MS;

const RENEW_BEFORE_MS = 15 * DAY_MS;

export type SessionUser = {
	id: string;
	email: string;
	name: string;
};

export type ValidSession = {
	user: SessionUser;
	expiresAt: Date;
	renewed: boolean;
};

export function generateSessionToken(): string {
	return randomBytes(32).toString('base64url');
}

/**
 * The session ID stored in the database. Only the browser has the token (ADR 0007).
 */
export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
	database: NodePgDatabase,
	userId: string,
	now: Date = new Date()
): Promise<{ token: string; expiresAt: Date }> {
	const token = generateSessionToken();
	const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

	await database.insert(sessions).values({
		id: hashSessionToken(token),
		userId,
		expiresAt,
		createdAt: now
	});

	return { token, expiresAt };
}

/**
 * Returns the signed-in user for a token, or null.
 *
 * Expired sessions are deleted. A session with less than 15 days left is extended.
 */
export async function validateSessionToken(
	database: NodePgDatabase,
	token: string,
	now: Date = new Date()
): Promise<ValidSession | null> {
	const sessionId = hashSessionToken(token);

	const [row] = await database
		.select({
			expiresAt: sessions.expiresAt,
			user: { id: users.id, email: users.email, name: users.name },
			active: users.active
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, sessionId))
		.limit(1);

	if (!row) {
		return null;
	}

	if (row.expiresAt.getTime() <= now.getTime()) {
		await database.delete(sessions).where(eq(sessions.id, sessionId));
		return null;
	}

	if (!row.active) {
		return null;
	}

	if (row.expiresAt.getTime() - now.getTime() >= RENEW_BEFORE_MS) {
		return { user: row.user, expiresAt: row.expiresAt, renewed: false };
	}

	const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

	await database.update(sessions).set({ expiresAt }).where(eq(sessions.id, sessionId));

	return { user: row.user, expiresAt, renewed: true };
}

export async function invalidateSession(database: NodePgDatabase, token: string): Promise<void> {
	await database.delete(sessions).where(eq(sessions.id, hashSessionToken(token)));
}
