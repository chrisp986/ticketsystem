import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { jobQueues } from '../lib/modules/jobs/job.constants';
import { jobSchema } from '../lib/modules/jobs/job.validation';
import type { Job, JobType } from '../lib/modules/jobs/job.validation';
import type { JobRecord } from '../lib/server/db/schema/jobs';
import { claimJob } from '../lib/server/jobs/claim-job';
import { recordJobFailure, recordJobSuccess } from '../lib/server/jobs/finish-job';
import type { JobClaim } from '../lib/server/jobs/finish-job';
import { logger, safeErrorMessage } from '../lib/server/logger';

type JobQueue = (typeof jobQueues)[number];

export type JobContext = {
	db: NodePgDatabase;
};

/**
 * One handler per job type. A new job type fails type checking until it has one.
 */
export type JobHandlers = {
	[T in JobType]: (
		payload: Extract<Job, { type: T }>['payload'],
		context: JobContext
	) => Promise<void>;
};

export type WorkerOptions = {
	db: NodePgDatabase;
	workerId: string;
	handlers: JobHandlers;
	concurrency: Record<JobQueue, number>;
	pollIntervalMs: number;
	lockDurationMs: number;
};

export type Worker = {
	/**
	 * Stops claiming and waits for running jobs. A job still running after the timeout keeps
	 * its lock, to be recovered once the lock expires (step 3.4).
	 */
	stop(timeoutMs: number): Promise<'stopped' | 'timed_out'>;
};

/**
 * Starts the claim loops: one per concurrent job, so a queue never runs more than its limit
 * and a busy queue never holds up another (ADR 0003).
 */
export function startWorker(options: WorkerOptions): Worker {
	const { db, workerId, handlers, concurrency, pollIntervalMs, lockDurationMs } = options;

	let stopping = false;
	const wakers = new Set<() => void>();

	function sleep(ms: number): Promise<void> {
		return new Promise((resolve) => {
			const wake = () => {
				clearTimeout(timer);
				wakers.delete(wake);
				resolve();
			};
			const timer = setTimeout(wake, ms);
			wakers.add(wake);
		});
	}

	async function runHandler(record: JobRecord): Promise<void> {
		const job = jobSchema.safeParse({ type: record.type, payload: record.payload });

		if (!job.success) {
			// A fixed message: the validation error could quote the payload.
			throw new Error('The job type or payload is invalid.');
		}

		const handler = handlers[job.data.type] as (
			payload: Job['payload'],
			context: JobContext
		) => Promise<void>;

		await handler(job.data.payload, { db });
	}

	async function runJob(record: JobRecord): Promise<void> {
		const context = {
			jobId: record.id,
			type: record.type,
			attempt: record.attempts,
			workerId
		};
		const claim: JobClaim = { jobId: record.id, workerId, attemptNumber: record.attempts };
		const startedAt = Date.now();

		let handlerError: { err: unknown } | undefined;

		try {
			await runHandler(record);
		} catch (err) {
			handlerError = { err };
		}

		const durationMs = Date.now() - startedAt;

		try {
			if (handlerError) {
				logger.error('job failed', { ...context, durationMs, err: handlerError.err });
			} else {
				logger.info('job succeeded', { ...context, durationMs });
			}

			const finished = handlerError
				? await recordJobFailure(db, claim, safeErrorMessage(handlerError.err))
				: await recordJobSuccess(db, claim);

			if (finished === 'lock_lost') {
				logger.warn('job result discarded, the lock was lost', context);
			}
		} catch (err) {
			// The job stays running until its lock expires (step 3.4).
			logger.error('job result could not be recorded', { ...context, err });
		}
	}

	async function claimLoop(queue: JobQueue): Promise<void> {
		while (!stopping) {
			try {
				const record = await claimJob(db, { queue, workerId, lockDurationMs });

				if (record) {
					await runJob(record);
					continue;
				}
			} catch (err) {
				logger.error('job claim failed', { queue, workerId, err });
			}

			if (!stopping) {
				await sleep(pollIntervalMs);
			}
		}
	}

	const loops = (Object.entries(concurrency) as [JobQueue, number][]).flatMap(([queue, count]) =>
		Array.from({ length: count }, () => claimLoop(queue))
	);
	const finished = Promise.all(loops);

	return {
		async stop(timeoutMs) {
			stopping = true;

			for (const wake of [...wakers]) {
				wake();
			}

			let timer: NodeJS.Timeout | undefined;

			const outcome = await Promise.race([
				finished.then(() => 'stopped' as const),
				new Promise<'timed_out'>((resolve) => {
					timer = setTimeout(() => resolve('timed_out'), timeoutMs);
				})
			]);

			clearTimeout(timer);

			return outcome;
		}
	};
}
