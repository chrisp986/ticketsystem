import { and, eq, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { JOB_ERROR_MAX_LENGTH } from '../../modules/jobs/job.constants';
import { jobAttempts, jobs } from '../db/schema/jobs';

/**
 * The try being finished, as its worker knows it.
 */
export type JobClaim = {
	jobId: string;
	workerId: string;
	attemptNumber: number;
};

type FinishOutcome = 'recorded' | 'lock_lost';

async function finishJob(
	database: NodePgDatabase,
	claim: JobClaim,
	result: { status: 'succeeded' | 'dead'; outcome: 'succeeded' | 'failed'; error: string | null },
	now: Date
): Promise<FinishOutcome> {
	return database.transaction(async (tx) => {
		const [finished] = await tx
			.update(jobs)
			.set({
				status: result.status,
				lockedBy: null,
				lockedUntil: null,
				finishedAt: now,
				updatedAt: now
			})
			.where(
				and(
					eq(jobs.id, claim.jobId),
					eq(jobs.status, 'running'),
					eq(jobs.lockedBy, claim.workerId),
					eq(jobs.attempts, claim.attemptNumber)
				)
			)
			.returning({ id: jobs.id });

		if (!finished) {
			return 'lock_lost';
		}

		await tx
			.update(jobAttempts)
			.set({ finishedAt: now, outcome: result.outcome, error: result.error })
			.where(
				and(
					eq(jobAttempts.jobId, claim.jobId),
					eq(jobAttempts.attemptNumber, claim.attemptNumber),
					isNull(jobAttempts.outcome)
				)
			);

		return 'recorded';
	});
}

/**
 * Records a finished job. Returns `lock_lost`, and writes nothing, when this worker no longer
 * holds the job, so it cannot overwrite the result of a newer try (ADR 0011).
 */
export async function recordJobSuccess(
	database: NodePgDatabase,
	claim: JobClaim,
	now: Date = new Date()
): Promise<FinishOutcome> {
	return finishJob(
		database,
		claim,
		{ status: 'succeeded', outcome: 'succeeded', error: null },
		now
	);
}

/**
 * Records a failed try. The job is dead until retries exist (step 3.3).
 *
 * The error is stored for operators and must not contain customer data (ADR 0011).
 */
export async function recordJobFailure(
	database: NodePgDatabase,
	claim: JobClaim,
	error: string,
	now: Date = new Date()
): Promise<FinishOutcome> {
	return finishJob(
		database,
		claim,
		{ status: 'dead', outcome: 'failed', error: error.slice(0, JOB_ERROR_MAX_LENGTH) },
		now
	);
}
