import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, test } from 'vitest';

import { createDb } from '../../src/lib/server/db/create-db';
import { jobAttempts, jobs } from '../../src/lib/server/db/schema/jobs';
import { claimJob } from '../../src/lib/server/jobs/claim-job';
import { recordJobFailure, recordJobSuccess } from '../../src/lib/server/jobs/finish-job';
import { testDb, testPool } from './helpers/db';
import { getTestDatabaseUrl } from './helpers/test-database-url';

const now = new Date('2026-11-01T12:00:00.000Z');
const lockDurationMs = 60_000;
const claimInput = { queue: 'default', workerId: 'worker-a', lockDurationMs } as const;

// The test pool has one connection, too few to claim at the same time.
const concurrent = createDb(getTestDatabaseUrl(), 5);

beforeEach(async () => {
	await testDb.delete(jobs);
});

afterAll(async () => {
	await testDb.delete(jobs);
	await concurrent.pool.end();
	await testPool.end();
});

async function insertJob(values: Partial<typeof jobs.$inferInsert> = {}) {
	const [job] = await testDb
		.insert(jobs)
		.values({
			type: 'overdue_next_steps',
			queue: 'default',
			payload: {},
			runAt: new Date(now.getTime() - 1000),
			...values
		})
		.returning();

	if (!job) {
		throw new Error('Test job was not created.');
	}

	return job;
}

async function storedJob(id: string) {
	const [job] = await testDb.select().from(jobs).where(eq(jobs.id, id));
	return job;
}

async function attemptsOf(jobId: string) {
	return testDb.select().from(jobAttempts).where(eq(jobAttempts.jobId, jobId));
}

async function claimed() {
	const job = await claimJob(testDb, claimInput, now);

	if (!job) {
		throw new Error('No job was claimed.');
	}

	return { jobId: job.id, workerId: claimInput.workerId, attemptNumber: job.attempts };
}

describe('claiming', () => {
	test('locks the job and records the attempt', async () => {
		const job = await insertJob();

		expect(await claimJob(testDb, claimInput, now)).toMatchObject({
			id: job.id,
			status: 'running',
			attempts: 1,
			lockedBy: 'worker-a',
			lockedUntil: new Date(now.getTime() + lockDurationMs),
			updatedAt: now
		});
		expect(await attemptsOf(job.id)).toMatchObject([
			{ attemptNumber: 1, workerId: 'worker-a', startedAt: now, finishedAt: null, outcome: null }
		]);
	});

	test('returns null when no job is queued', async () => {
		expect(await claimJob(testDb, claimInput, now)).toBeNull();
	});

	test('takes the job with the earliest run time first', async () => {
		await insertJob({ runAt: new Date(now.getTime() - 1000) });
		const earliest = await insertJob({ runAt: new Date(now.getTime() - 5000) });

		expect((await claimJob(testDb, claimInput, now))?.id).toBe(earliest.id);
	});

	test('claims a job due exactly now but not one due later', async () => {
		const due = await insertJob({ runAt: now });
		await insertJob({ runAt: new Date(now.getTime() + 1) });

		expect((await claimJob(testDb, claimInput, now))?.id).toBe(due.id);
		expect(await claimJob(testDb, claimInput, now)).toBeNull();
	});

	test('leaves jobs on other queues alone', async () => {
		const job = await insertJob({ queue: 'ai' });

		expect(await claimJob(testDb, claimInput, now)).toBeNull();
		expect((await claimJob(testDb, { ...claimInput, queue: 'ai' }, now))?.id).toBe(job.id);
	});

	test('does not claim a running job again', async () => {
		await insertJob();
		await claimJob(testDb, claimInput, now);

		expect(await claimJob(testDb, claimInput, now)).toBeNull();
	});

	test('never gives a job to two workers claiming at the same time', async () => {
		const inserted = await Promise.all(Array.from({ length: 20 }, () => insertJob()));

		async function drain(workerId: string) {
			const ids: string[] = [];

			for (;;) {
				const job = await claimJob(concurrent.db, { ...claimInput, workerId }, now);

				if (!job) {
					return ids;
				}

				ids.push(job.id);
			}
		}

		const claimedIds = (
			await Promise.all(['a', 'b', 'c', 'd', 'e'].map((worker) => drain(worker)))
		).flat();

		expect(claimedIds.toSorted()).toEqual(inserted.map((job) => job.id).toSorted());
		expect(await testDb.select().from(jobAttempts)).toHaveLength(20);
	});
});

describe('finishing', () => {
	const later = new Date(now.getTime() + 5000);

	test('records a success and releases the lock', async () => {
		const job = await insertJob();
		const claim = await claimed();

		expect(await recordJobSuccess(testDb, claim, later)).toBe('recorded');
		expect(await storedJob(job.id)).toMatchObject({
			status: 'succeeded',
			lockedBy: null,
			lockedUntil: null,
			finishedAt: later
		});
		expect(await attemptsOf(job.id)).toMatchObject([
			{ finishedAt: later, outcome: 'succeeded', error: null }
		]);
	});

	test('records a failure with its error and makes the job dead', async () => {
		const job = await insertJob();
		const claim = await claimed();

		expect(await recordJobFailure(testDb, claim, 'x'.repeat(3000), later)).toBe('recorded');
		expect(await storedJob(job.id)).toMatchObject({
			status: 'dead',
			lockedBy: null,
			finishedAt: later
		});
		expect(await attemptsOf(job.id)).toMatchObject([
			{ finishedAt: later, outcome: 'failed', error: 'x'.repeat(2000) }
		]);
	});

	test('refuses a worker that does not hold the job', async () => {
		const job = await insertJob();
		const claim = await claimed();

		expect(await recordJobSuccess(testDb, { ...claim, workerId: 'worker-b' }, later)).toBe(
			'lock_lost'
		);
		expect(await recordJobFailure(testDb, { ...claim, attemptNumber: 2 }, 'late', later)).toBe(
			'lock_lost'
		);
		expect(await storedJob(job.id)).toMatchObject({ status: 'running', lockedBy: 'worker-a' });
		expect(await attemptsOf(job.id)).toMatchObject([{ outcome: null }]);
	});

	test('cannot finish a job twice', async () => {
		const job = await insertJob();
		const claim = await claimed();

		await recordJobSuccess(testDb, claim, later);

		expect(await recordJobFailure(testDb, claim, 'late', later)).toBe('lock_lost');
		expect(await storedJob(job.id)).toMatchObject({ status: 'succeeded' });
	});
});
