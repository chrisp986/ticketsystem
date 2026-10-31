import { sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';

import {
	DEFAULT_MAX_JOB_ATTEMPTS,
	jobAttemptOutcomes,
	jobQueues,
	jobStatuses
} from '$lib/modules/jobs/job.constants';

import { notBlank } from './not-blank';

export const jobQueue = pgEnum('job_queue', jobQueues);

export const jobStatus = pgEnum('job_status', jobStatuses);

export const jobAttemptOutcome = pgEnum('job_attempt_outcome', jobAttemptOutcomes);

/**
 * The background job queue (ADR 0003, ADR 0011).
 */
export const jobs = pgTable(
	'jobs',
	{
		id: uuid('id').defaultRandom().primaryKey(),

		type: text('type').notNull(),

		queue: jobQueue('queue').notNull(),

		payload: jsonb('payload').notNull(),

		status: jobStatus('status').default('queued').notNull(),

		runAt: timestamp('run_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),

		attempts: integer('attempts').default(0).notNull(),

		maxAttempts: integer('max_attempts').default(DEFAULT_MAX_JOB_ATTEMPTS).notNull(),

		lockedBy: text('locked_by'),

		lockedUntil: timestamp('locked_until', { withTimezone: true, mode: 'date' }),

		dedupeKey: text('dedupe_key'),

		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),

		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),

		finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [
		index('jobs_claim_idx')
			.on(table.queue, table.runAt)
			.where(sql`${table.status} = 'queued'`),
		index('jobs_locked_until_idx')
			.on(table.lockedUntil)
			.where(sql`${table.status} = 'running'`),
		uniqueIndex('jobs_dedupe_key_idx')
			.on(table.dedupeKey)
			.where(sql`${table.status} IN ('queued', 'running')`),
		check('jobs_type_not_blank', notBlank(table.type)),
		check(
			'jobs_dedupe_key_not_blank',
			sql`${table.dedupeKey} IS NULL OR ${notBlank(table.dedupeKey)}`
		),
		check(
			'jobs_lock_only_when_running',
			sql`(${table.status} = 'running') = (${table.lockedBy} IS NOT NULL) AND (${table.status} = 'running') = (${table.lockedUntil} IS NOT NULL)`
		),
		check(
			'jobs_finished_at_matches_status',
			sql`(${table.status} IN ('succeeded', 'dead')) = (${table.finishedAt} IS NOT NULL)`
		),
		check(
			'jobs_attempts_within_limit',
			sql`${table.maxAttempts} > 0 AND ${table.attempts} >= 0 AND ${table.attempts} <= ${table.maxAttempts}`
		),
		check(
			'jobs_queued_has_attempts_left',
			sql`${table.status} <> 'queued' OR ${table.attempts} < ${table.maxAttempts}`
		)
	]
);

/**
 * One row per try of a job. Deleted with the job, which is operational data (ADR 0011).
 */
export const jobAttempts = pgTable(
	'job_attempts',
	{
		id: uuid('id').defaultRandom().primaryKey(),

		jobId: uuid('job_id')
			.notNull()
			.references(() => jobs.id, { onDelete: 'cascade' }),

		attemptNumber: integer('attempt_number').notNull(),

		workerId: text('worker_id').notNull(),

		startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),

		finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),

		outcome: jobAttemptOutcome('outcome'),

		error: text('error')
	},
	(table) => [
		uniqueIndex('job_attempts_job_id_attempt_number_idx').on(table.jobId, table.attemptNumber),
		check('job_attempts_number_positive', sql`${table.attemptNumber} > 0`),
		check(
			'job_attempts_outcome_when_finished',
			sql`(${table.finishedAt} IS NOT NULL) = (${table.outcome} IS NOT NULL)`
		),
		check(
			'job_attempts_no_error_on_success',
			sql`${table.outcome} IS DISTINCT FROM 'succeeded' OR ${table.error} IS NULL`
		)
	]
);

export type JobRecord = typeof jobs.$inferSelect;
