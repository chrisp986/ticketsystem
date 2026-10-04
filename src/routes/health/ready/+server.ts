import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { logger } from '$lib/server/logger';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		await db.execute(sql`select 1`);
		return json({ status: 'ready' });
	} catch (err) {
		logger.warn('readiness check failed', { requestId: locals.requestId, err });
		return json({ status: 'unavailable' }, { status: 503 });
	}
};
