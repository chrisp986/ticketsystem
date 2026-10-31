import { and, eq, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { jobRetryDelayMs } from '../../modules/jobs/job.backoff';
import { JOB_ERROR_MAX_LENGTH } from '../../modules/jobs/job.constants';
import { jobAttempts, jobs } from '../db/schema/jobs';

type Transaction = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

/**
 * The try being finished, as its worker knows it.
 */
export type JobClaim = {
	jobId: string;
	workerId: string;
	attemptNumber: number;
};

export type JobFailureOutcome =
	{ outcome: 'retrying'; runAt: Date } | { outcome: 'dead' } | { outcome: 'lock_lost' };

function heldBy(claim: JobClaim) {
	return and(
		eq(jobs.id, claim.jobId),
		eq(jobs.status, 'running'),
		eq(jobs.lockedBy, claim.workerId),
		eq(jobs.attempts, claim.attemptNumber)
	);
}

async function closeAttempt(
	tx: Transaction,
	claim: Pick<JobClaim, 'jobId' | 'attemptNumber'>,
	result: { outcome: 'succeeded' | 'failed' | 'lost'; error: string | null },
	now: Date
): Promise<void> {
	await tx
		.update(jobAttempts)
		.set({ finishedAt: now, ...result })
		.where(
			and(
				eq(jobAttempts.jobId, claim.jobId),
				eq(jobAttempts.attemptNumber, claim.attemptNumber),
				isNull(jobAttempts.outcome)
			)
		);
}

/**
 * Records a finished job. Returns `lock_lost`, and writes nothing, when this worker no longer
 * holds the job, so it cannot overwrite the result of a newer try (ADR 0011).
 */
export async function recordJobSuccess(
	database: NodePgDatabase,
	claim: JobClaim,
	now: Date = new Date()
): Promise<'recorded' | 'lock_lost'> {
	return database.transaction(async (tx) => {
		const [finished] = await tx
			.update(jobs)
			.set({
				status: 'succeeded',
				lockedBy: null,
				lockedUntil: null,
				finishedAt: now,
				updatedAt: now
			})
			.where(heldBy(claim))
			.returning({ id: jobs.id });

		if (!finished) {
			return 'lock_lost';
		}

		await closeAttempt(tx, claim, { outcome: 'succeeded', error: null }, now);

		return 'recorded';
	});
}

/**
 * Ends an attempt that did not succeed. The job waits and returns to the queue while it has
 * attempts left; otherwise, or with `retry: false`, it is dead. The caller holds the row lock.
 */
export async function endFailedAttempt(
	tx: Transaction,
	attempt: { jobId: string; attemptNumber: number; maxAttempts: number },
	failure: { outcome: 'failed' | 'lost'; error: string; retry: boolean },
	now: Date
): Promise<{ outcome: 'retrying'; runAt: Date } | { outcome: 'dead' }> {
	const released = { lockedBy: null, lockedUntil: null, updatedAt: now };
	const retry = failure.retry && attempt.attemptNumber < attempt.maxAttempts;
	const runAt = new Date(now.getTime() + jobRetryDelayMs(attempt.attemptNumber));

	await tx
		.update(jobs)
		.set(
			retry
				? { ...released, status: 'queued', runAt }
				: { ...released, status: 'dead', finishedAt: now }
		)
		.where(eq(jobs.id, attempt.jobId));

	await closeAttempt(
		tx,
		attempt,
		{ outcome: failure.outcome, error: failure.error.slice(0, JOB_ERROR_MAX_LENGTH) },
		now
	);

	return retry ? { outcome: 'retrying', runAt } : { outcome: 'dead' };
}

/**
 * Records a failed try; `retry: false` is for a failure that retrying cannot fix.
 *
 * The error is stored for operators and must not contain customer data (ADR 0011).
 */
export async function recordJobFailure(
	database: NodePgDatabase,
	claim: JobClaim,
	failure: { error: string; retry: boolean },
	now: Date = new Date()
): Promise<JobFailureOutcome> {
	return database.transaction(async (tx): Promise<JobFailureOutcome> => {
		const [held] = await tx
			.select({ maxAttempts: jobs.maxAttempts })
			.from(jobs)
			.where(heldBy(claim))
			.for('update');

		if (!held) {
			return { outcome: 'lock_lost' };
		}

		return endFailedAttempt(
			tx,
			{ ...claim, maxAttempts: held.maxAttempts },
			{ outcome: 'failed', ...failure },
			now
		);
	});
}

/**
 * Extends the lock of a running job. Returns `lock_lost` when this worker no longer holds it.
 */
export async function renewJobLock(
	database: NodePgDatabase,
	claim: JobClaim,
	lockDurationMs: number,
	now: Date = new Date()
): Promise<'renewed' | 'lock_lost'> {
	const [renewed] = await database
		.update(jobs)
		.set({ lockedUntil: new Date(now.getTime() + lockDurationMs), updatedAt: now })
		.where(heldBy(claim))
		.returning({ id: jobs.id });

	return renewed ? 'renewed' : 'lock_lost';
}
