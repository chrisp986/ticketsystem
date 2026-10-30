import { z } from 'zod';

import { JOB_DEDUPE_KEY_MAX_LENGTH, jobQueues } from './job.constants';

/**
 * Every job type with its payload (ADR 0011). A new type is added here and in `jobQueueByType`.
 */
export const jobSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('overdue_next_steps'),
		payload: z.strictObject({})
	})
]);

export type Job = z.infer<typeof jobSchema>;

export type JobType = Job['type'];

/**
 * The queue of each job type. A new job type fails type checking until it has one.
 */
export const jobQueueByType: Record<JobType, (typeof jobQueues)[number]> = {
	overdue_next_steps: 'default'
};

/**
 * Input for enqueuing a job: the job and when and how it may run.
 */
export const enqueueJobSchema = z.intersection(
	jobSchema,
	z.object({
		runAt: z.date().optional(),
		maxAttempts: z.number().int().positive().optional(),
		dedupeKey: z.string().trim().min(1).max(JOB_DEDUPE_KEY_MAX_LENGTH).optional()
	})
);

export type EnqueueJobInput = z.infer<typeof enqueueJobSchema>;
