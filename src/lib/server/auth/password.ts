import { hash, verify } from '@node-rs/argon2';

// Argon2id with the OWASP minimum: 19 MiB memory, 2 iterations, parallelism 1 (ADR 0007).
const options = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

let dummyHash: Promise<string> | undefined;

export function hashPassword(password: string): Promise<string> {
	return hash(password, options);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
	return verify(passwordHash, password, options);
}

/**
 * Spends the same time as a real check, so a login for an unknown email
 * cannot be told apart by response time.
 */
export async function verifyDummyPassword(password: string): Promise<void> {
	dummyHash ??= hashPassword('dummy password for unknown users');
	await verifyPassword(await dummyHash, password);
}
