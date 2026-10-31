import { and, asc, eq, lt } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { jobs } from '../db/schema/jobs';
import { endFailedAttempt } from './finish-job';

const LOST_ATTEMPT_ERROR = 'The lock expired before the worker finished.';

export type RecoveredJob = {
	jobId: string;
	type: string;
	attempt: number;
} & ({ outcome: 'retrying'; runAt: Date } | { outcome: 'dead' });

async function recoverOneJob(database: NodePgDatabase, now: Date): Promise<RecoveredJob | null> {
	return database.transaction(async (tx) => {
		const [expired] = await tx
			.select({
				id: jobs.id,
				type: jobs.type,
				attempts: jobs.attempts,
				maxAttempts: jobs.maxAttempts
			})
			.from(jobs)
			.where(and(eq(jobs.status, 'running'), lt(jobs.lockedUntil, now)))
			.orderBy(asc(jobs.lockedUntil))
			.limit(1)
			.for('update', { skipLocked: true });

		if (!expired) {
			return null;
		}

		const ended = await endFailedAttempt(
			tx,
			{ jobId: expired.id, attemptNumber: expired.attempts, maxAttempts: expired.maxAttempts },
			{ outcome: 'lost', error: LOST_ATTEMPT_ERROR, retry: true },
			now
		);

		return { jobId: expired.id, type: expired.type, attempt: expired.attempts, ...ended };
	});
}

/**
 * Takes back every job whose lock expired, because its worker died or stalled. A lost attempt
 * counts like a failed one, so a job that kills its worker every time ends up dead (ADR 0011).
 *
 * Workers may call this at the same time: each job is recovered once.
 */
export async function recoverExpiredJobs(
	database: NodePgDatabase,
	now: Date = new Date()
): Promise<RecoveredJob[]> {
	const recovered: RecoveredJob[] = [];

	for (;;) {
		const job = await recoverOneJob(database, now);

		if (!job) {
			return recovered;
		}

		recovered.push(job);
	}
}
