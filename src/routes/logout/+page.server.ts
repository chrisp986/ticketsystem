import { redirect } from '@sveltejs/kit';

import { sessionCookieOptions } from '$lib/server/auth/cookie';
import { SESSION_COOKIE, invalidateSession } from '$lib/server/auth/session';
import { db } from '$lib/server/db';
import { logger } from '$lib/server/logger';
import type { Actions, PageServerLoad } from './$types';

// Signing out changes state, so it is only a form action; a GET goes back home.
export const load = (() => {
	redirect(303, '/');
}) satisfies PageServerLoad;

export const actions = {
	default: async ({ cookies, locals, url }) => {
		const token = cookies.get(SESSION_COOKIE);

		if (token) {
			await invalidateSession(db, token);
		}

		cookies.delete(SESSION_COOKIE, sessionCookieOptions(url));

		logger.info('logout', { requestId: locals.requestId, userId: locals.user?.id });

		redirect(303, '/login');
	}
} satisfies Actions;
