import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		await db.execute(sql`SELECT 1`);

		console.log('DB connection successful.');
	} catch (error) {
		console.error('DB connection error:', error);

		if (error instanceof Error && error.cause) {
			console.error('Ursache:', error.cause);
		}

		throw error;
	}

	return {};
};
