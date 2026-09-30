import type { Handle, HandleServerError } from '@sveltejs/kit';

import { logger } from '$lib/server/logger';

export const handle: Handle = async ({ event, resolve }) => {
	const requestId = crypto.randomUUID();
	event.locals.requestId = requestId;

	const start = performance.now();
	const response = await resolve(event);

	response.headers.set('x-request-id', requestId);

	logger.info('request completed', {
		requestId,
		method: event.request.method,
		path: event.url.pathname,
		status: response.status,
		durationMs: Math.round(performance.now() - start)
	});

	return response;
};

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
