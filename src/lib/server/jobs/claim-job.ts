import { and, asc, eq, lte } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { jobQueues } from '../../modules/jobs/job.constants';
import { jobAttempts, jobs } from '../db/schema/jobs';
import type { JobRecord } from '../db/schema/jobs';

type ClaimJobInput = {
	queue: (typeof jobQueues)[number];
	workerId: string;
	lockDurationMs: number;
};

/**
 * Claims the due job with the earliest `run_at` on a queue, or returns null when none is free.
 *
 * `SKIP LOCKED` lets workers claim at the same time without waiting or getting the same job.
 * The transaction ends here: the job runs outside it, however long it takes (ADR 0011).
 */
export async function claimJob(
	database: NodePgDatabase,
	input: ClaimJobInput,
	now: Date = new Date()
): Promise<JobRecord | null> {
	return database.transaction(async (tx) => {
		const [due] = await tx
			.select({ id: jobs.id, attempts: jobs.attempts })
			.from(jobs)
			.where(and(eq(jobs.status, 'queued'), eq(jobs.queue, input.queue), lte(jobs.runAt, now)))
			.orderBy(asc(jobs.runAt))
			.limit(1)
			.for('update', { skipLocked: true });

		if (!due) {
			return null;
		}

		const attemptNumber = due.attempts + 1;

		const [claimed] = await tx
			.update(jobs)
			.set({
				status: 'running',
				attempts: attemptNumber,
				lockedBy: input.workerId,
				lockedUntil: new Date(now.getTime() + input.lockDurationMs),
				updatedAt: now
			})
			.where(eq(jobs.id, due.id))
			.returning();

		if (!claimed) {
			throw new Error('A locked job could not be updated.');
		}

		await tx.insert(jobAttempts).values({
			jobId: due.id,
			attemptNumber,
			workerId: input.workerId,
			startedAt: now
		});

		return claimed;
	});
}
