import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { enqueueJobSchema, jobQueueByType } from '../../modules/jobs/job.validation';
import type { EnqueueJobInput } from '../../modules/jobs/job.validation';
import { jobs } from '../db/schema/jobs';
import type { JobRecord } from '../db/schema/jobs';

type Queryable = Pick<NodePgDatabase, 'insert'>;

/**
 * Adds a job to its queue. Pass a transaction to save the job together with the change
 * that needs it (ADR 0011). An invalid job is a programming error and throws.
 *
 * Returns `duplicate`, and writes nothing, when a queued or running job has the same dedupe key.
 */
export async function enqueueJob(
	database: Queryable,
	input: EnqueueJobInput,
	now: Date = new Date()
): Promise<JobRecord | 'duplicate'> {
	const { type, payload, runAt, maxAttempts, dedupeKey } = enqueueJobSchema.parse(input);

	const [job] = await database
		.insert(jobs)
		.values({
			type,
			queue: jobQueueByType[type],
			payload,
			runAt: runAt ?? now,
			maxAttempts,
			dedupeKey,
			createdAt: now,
			updatedAt: now
		})
		.onConflictDoNothing({
			target: jobs.dedupeKey,
			where: sql`${jobs.status} IN ('queued', 'running')`
		})
		.returning();

	return job ?? 'duplicate';
}
