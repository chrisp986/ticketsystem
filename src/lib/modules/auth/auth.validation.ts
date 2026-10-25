import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const newPasswordSchema = z
	.string()
	.min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
	.max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`);

export const userNameSchema = z.string().trim().min(1).max(100);

export const createUserSchema = z.object({
	email: emailSchema,
	name: userNameSchema,
	password: newPasswordSchema
});

/**
 * Login input. The password is only length-checked, so old passwords keep working
 * if the rules for new ones change.
 */
export const loginSchema = z.object({
	email: emailSchema,
	password: z.string().min(1).max(PASSWORD_MAX_LENGTH)
});

/**
 * Returns the path to continue to after login, or `/` when the value is not a local path.
 *
 * Rejects `//host` and `/\host`, which browsers treat as other origins.
 */
export function safeRedirectTarget(value: string | null | undefined): string {
	if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
		return '/';
	}

	return value;
}
