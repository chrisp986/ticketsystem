import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

import { db } from '$lib/server/db';
import { logger, setLogLevel } from '$lib/server/logger';
import { serverConfig } from '$lib/server/env';
import { SESSION_COOKIE, validateSessionToken } from '$lib/server/auth/session';
import { sessionCookieOptions } from '$lib/server/auth/cookie';

export const init: ServerInit = () => {
	setLogLevel(serverConfig.LOG_LEVEL);
};

const handleRequest: Handle = async ({ event, resolve }) => {
	const requestId = crypto.randomUUID();
	event.locals.requestId = requestId;

	const start = performance.now();
	const response = await resolve(event);

	response.headers.set('x-request-id', requestId);

	const level = event.url.pathname.startsWith('/health/') ? 'debug' : 'info';

	logger[level]('request completed', {
		requestId,
		method: event.request.method,
		path: event.url.pathname,
		status: response.status,
		durationMs: Math.round(performance.now() - start)
	});

	return response;
};

function isPublicPath(pathname: string): boolean {
	return pathname === '/login' || pathname.startsWith('/health/');
}

/**
 * Loads the signed-in user and sends everyone else to the login page (ADR 0007).
 */
const handleAuth: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

	const token = event.cookies.get(SESSION_COOKIE);

	if (token) {
		const session = await validateSessionToken(db, token);

		if (session) {
			event.locals.user = session.user;

			if (session.renewed) {
				event.cookies.set(
					SESSION_COOKIE,
					token,
					sessionCookieOptions(event.url, session.expiresAt)
				);
			}
		} else {
			event.cookies.delete(SESSION_COOKIE, sessionCookieOptions(event.url));
		}
	}

	if (!event.locals.user && !isPublicPath(event.url.pathname)) {
		const target = event.url.pathname + event.url.search;
		const location = target === '/' ? '/login' : `/login?redirectTo=${encodeURIComponent(target)}`;

		return new Response(null, { status: 303, headers: { location } });
	}

	return resolve(event);
};

export const handle = sequence(handleRequest, handleAuth);

export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const requestId = event.locals.requestId;

	// Unmatched URLs (bots probing /wp-login.php, etc.) also arrive here.
	// The request log already records them, so they are not error-level events.
	if (status === 404) {
		return { message, requestId };
	}

	logger.error('unhandled error', {
		requestId,
		method: event.request.method,
		path: event.url.pathname,
		status,
		error
	});

	return { message: 'An unexpected error occurred.', requestId };
};
