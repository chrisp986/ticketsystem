import { fail, redirect } from '@sveltejs/kit';

import { loginSchema, safeRedirectTarget } from '$lib/modules/auth/auth.validation';
import { sessionCookieOptions } from '$lib/server/auth/cookie';
import { SESSION_COOKIE, createSession } from '$lib/server/auth/session';
import { authenticate } from '$lib/server/auth/users';
import { db } from '$lib/server/db';
import { logger } from '$lib/server/logger';
import type { Actions, PageServerLoad } from './$types';

const LOGIN_FAILED = 'Email or password is incorrect.';

export const load = (({ locals, url }) => {
	if (locals.user) {
		redirect(303, safeRedirectTarget(url.searchParams.get('redirectTo')));
	}
}) satisfies PageServerLoad;

export const actions = {
	default: async ({ request, cookies, url, locals }) => {
		const formData = await request.formData();
		const emailValue = formData.get('email');
		const email = typeof emailValue === 'string' ? emailValue : '';

		const result = loginSchema.safeParse({ email, password: formData.get('password') });

		if (!result.success) {
			return fail(400, { email, message: LOGIN_FAILED });
		}

		const user = await authenticate(db, result.data.email, result.data.password);

		if (!user) {
			logger.info('login failed', { requestId: locals.requestId });
			return fail(400, { email, message: LOGIN_FAILED });
		}

		const session = await createSession(db, user.id);

		cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(url, session.expiresAt));

		logger.info('login succeeded', { requestId: locals.requestId, userId: user.id });

		redirect(303, safeRedirectTarget(url.searchParams.get('redirectTo')));
	}
} satisfies Actions;
