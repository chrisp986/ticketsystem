import { asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { z } from 'zod';

import type { createUserSchema } from '../../modules/auth/auth.validation';
import { users } from '../db/schema/users';
import { hashPassword, verifyDummyPassword, verifyPassword } from './password';
import type { SessionUser } from './session';

type CreateUserInput = z.infer<typeof createUserSchema>;

const UNIQUE_VIOLATION = '23505';

export async function createUser(
	database: NodePgDatabase,
	input: CreateUserInput
): Promise<SessionUser | 'email_taken'> {
	const passwordHash = await hashPassword(input.password);

	try {
		const [user] = await database
			.insert(users)
			.values({ email: input.email, name: input.name, passwordHash })
			.returning({ id: users.id, email: users.email, name: users.name });

		if (!user) {
			throw new Error('User was not created.');
		}

		return user;
	} catch (err) {
		if (isUniqueViolation(err)) {
			return 'email_taken';
		}

		throw err;
	}
}

/**
 * Returns the user for a valid email and password, or null.
 *
 * Unknown email, wrong password and inactive user are indistinguishable (ADR 0007).
 */
export async function authenticate(
	database: NodePgDatabase,
	email: string,
	password: string
): Promise<SessionUser | null> {
	const [user] = await database.select().from(users).where(eq(users.email, email)).limit(1);

	if (!user) {
		await verifyDummyPassword(password);
		return null;
	}

	const valid = await verifyPassword(user.passwordHash, password);

	if (!valid || !user.active) {
		return null;
	}

	return { id: user.id, email: user.email, name: user.name };
}

export type UserOption = {
	id: string;
	name: string;
	active: boolean;
};

/**
 * All users by name, for assignee and owner choices. Inactive users are included
 * so that tickets they still hold can show their name (ADR 0008).
 */
export async function listUsers(database: NodePgDatabase): Promise<UserOption[]> {
	return database
		.select({ id: users.id, name: users.name, active: users.active })
		.from(users)
		.orderBy(asc(users.name), asc(users.id));
}

function isUniqueViolation(err: unknown): boolean {
	for (let current = err; current instanceof Error; current = current.cause) {
		if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) {
			return true;
		}
	}

	return false;
}
