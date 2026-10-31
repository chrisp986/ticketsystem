import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, test } from 'vitest';

import type { EnqueueJobInput } from '../../src/lib/modules/jobs/job.validation';
import { jobAttempts, jobs } from '../../src/lib/server/db/schema/jobs';
import { enqueueJob } from '../../src/lib/server/jobs/enqueue-job';
import { testDb, testPool } from './helpers/db';

const jobIds: string[] = [];
const job = { type: 'overdue_next_steps', payload: {} } as const;

afterEach(async () => {
	await testDb.delete(jobs).where(inArray(jobs.id, jobIds.splice(0)));
});

afterAll(async () => {
	await testPool.end();
});

async function enqueue(input: EnqueueJobInput = job, now?: Date) {
	const created = await enqueueJob(testDb, input, now);

	if (created === 'duplicate') {
		throw new Error('Test job was a duplicate.');
	}

	jobIds.push(created.id);
	return created;
}

async function insertJob(values: Partial<typeof jobs.$inferInsert>) {
	return testDb
		.insert(jobs)
		.values({ type: job.type, queue: 'default', payload: {}, ...values })
		.execute();
}

describe('enqueuing', () => {
	test('stores a queued job on the queue of its type', async () => {
		const now = new Date('2026-11-01T00:00:00.000Z');

		expect(await enqueue(job, now)).toMatchObject({
			type: 'overdue_next_steps',
			queue: 'default',
			payload: {},
			status: 'queued',
			runAt: now,
			attempts: 0,
			maxAttempts: 5,
			lockedBy: null,
			lockedUntil: null,
			finishedAt: null
		});
	});

	test('keeps the requested time and attempts', async () => {
		const runAt = new Date('2030-01-01T00:00:00.000Z');

		expect(await enqueue({ ...job, runAt, maxAttempts: 2 })).toMatchObject({
			runAt,
			maxAttempts: 2
		});
	});

	test('rejects an invalid payload without writing', async () => {
		const dedupeKey = crypto.randomUUID();

		await expect(
			enqueueJob(testDb, {
				...job,
				dedupeKey,
				payload: { unexpected: true }
			} as unknown as EnqueueJobInput)
		).rejects.toThrow();

		expect(await testDb.select().from(jobs).where(eq(jobs.dedupeKey, dedupeKey))).toHaveLength(0);
	});

	test('rolls back with the transaction of the caller', async () => {
		const dedupeKey = crypto.randomUUID();

		await expect(
			testDb.transaction(async (tx) => {
				await enqueueJob(tx, { ...job, dedupeKey });
				throw new Error('The change failed.');
			})
		).rejects.toThrow('The change failed.');

		expect(await testDb.select().from(jobs).where(eq(jobs.dedupeKey, dedupeKey))).toHaveLength(0);
	});

	test('commits with the transaction of the caller', async () => {
		const dedupeKey = crypto.randomUUID();

		const created = await testDb.transaction((tx) => enqueueJob(tx, { ...job, dedupeKey }));

		if (created === 'duplicate') {
			throw new Error('Test job was a duplicate.');
		}

		jobIds.push(created.id);

		expect(await testDb.select().from(jobs).where(eq(jobs.dedupeKey, dedupeKey))).toHaveLength(1);
	});
});

describe('deduplication', () => {
	test('a queued job blocks its key', async () => {
		const dedupeKey = crypto.randomUUID();

		await enqueue({ ...job, dedupeKey });

		expect(await enqueueJob(testDb, { ...job, dedupeKey })).toBe('duplicate');
		expect(await testDb.select().from(jobs).where(eq(jobs.dedupeKey, dedupeKey))).toHaveLength(1);
	});

	test('a running job blocks its key', async () => {
		const dedupeKey = crypto.randomUUID();
		const created = await enqueue({ ...job, dedupeKey });

		await testDb
			.update(jobs)
			.set({ status: 'running', lockedBy: 'worker-1', lockedUntil: new Date() })
			.where(eq(jobs.id, created.id));

		expect(await enqueueJob(testDb, { ...job, dedupeKey })).toBe('duplicate');
	});

	test.each(['succeeded', 'dead'] as const)('a job that is %s frees its key', async (status) => {
		const dedupeKey = crypto.randomUUID();
		const created = await enqueue({ ...job, dedupeKey });

		await testDb
			.update(jobs)
			.set({ status, finishedAt: new Date() })
			.where(eq(jobs.id, created.id));

		expect(await enqueue({ ...job, dedupeKey })).toMatchObject({ status: 'queued' });
	});

	test('jobs without a key do not block each other', async () => {
		const first = await enqueue();
		const second = await enqueue();

		expect(first.id).not.toBe(second.id);
	});
});

describe('job constraints', () => {
	test.each([
		['a running job without a lock', { status: 'running' }, 'jobs_lock_only_when_running'],
		[
			'a running job without a lock time',
			{ status: 'running', lockedBy: 'worker-1' },
			'jobs_lock_only_when_running'
		],
		[
			'a queued job with a lock',
			{ lockedBy: 'worker-1', lockedUntil: new Date() },
			'jobs_lock_only_when_running'
		],
		['a finished job without a time', { status: 'succeeded' }, 'jobs_finished_at_matches_status'],
		['a dead job without a time', { status: 'dead' }, 'jobs_finished_at_matches_status'],
		[
			'a queued job with a finish time',
			{ finishedAt: new Date() },
			'jobs_finished_at_matches_status'
		],
		['more attempts than allowed', { attempts: 6, maxAttempts: 5 }, 'jobs_attempts_within_limit'],
		['negative attempts', { attempts: -1 }, 'jobs_attempts_within_limit'],
		['no allowed attempts', { attempts: 0, maxAttempts: 0 }, 'jobs_attempts_within_limit'],
		['a blank type', { type: ' \n ' }, 'jobs_type_not_blank'],
		['a blank dedupe key', { dedupeKey: ' \t' }, 'jobs_dedupe_key_not_blank']
	] as const)('rejects %s', async (_, values, constraint) => {
		await expect(insertJob(values)).rejects.toMatchObject({ cause: { code: '23514', constraint } });
	});
});

describe('job attempts', () => {
	const attempt = (jobId: string, values: Partial<typeof jobAttempts.$inferInsert> = {}) =>
		testDb
			.insert(jobAttempts)
			.values({ jobId, attemptNumber: 1, workerId: 'worker-1', ...values })
			.execute();

	test('a job has one row per attempt number', async () => {
		const { id } = await enqueue();

		await attempt(id);

		await expect(attempt(id)).rejects.toMatchObject({
			cause: { code: '23505', constraint: 'job_attempts_job_id_attempt_number_idx' }
		});
	});

	test.each([
		['a number below one', { attemptNumber: 0 }, 'job_attempts_number_positive'],
		[
			'an outcome without a finish time',
			{ outcome: 'failed' },
			'job_attempts_outcome_when_finished'
		],
		[
			'a finish time without an outcome',
			{ finishedAt: new Date() },
			'job_attempts_outcome_when_finished'
		],
		[
			'an error on success',
			{ outcome: 'succeeded', finishedAt: new Date(), error: 'Boom.' },
			'job_attempts_no_error_on_success'
		]
	] as const)('rejects %s', async (_, values, constraint) => {
		const { id } = await enqueue();

		await expect(attempt(id, values)).rejects.toMatchObject({
			cause: { code: '23514', constraint }
		});
	});

	test('an unfinished attempt and a failure with an error are valid', async () => {
		const { id } = await enqueue();

		await attempt(id);
		await attempt(id, {
			attemptNumber: 2,
			outcome: 'failed',
			finishedAt: new Date(),
			error: 'Timed out.'
		});

		expect(await testDb.select().from(jobAttempts).where(eq(jobAttempts.jobId, id))).toHaveLength(
			2
		);
	});

	test('are deleted with their job', async () => {
		const { id } = await enqueue();

		await attempt(id);
		await testDb.delete(jobs).where(eq(jobs.id, id));

		expect(await testDb.select().from(jobAttempts).where(eq(jobAttempts.jobId, id))).toHaveLength(
			0
		);
	});
});
