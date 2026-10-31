import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { createDb } from '../../src/lib/server/db/create-db';
import { jobAttempts, jobs } from '../../src/lib/server/db/schema/jobs';
import { renewJobLock } from '../../src/lib/server/jobs/finish-job';
import { recoverExpiredJobs } from '../../src/lib/server/jobs/recover-expired-jobs';
import { logger } from '../../src/lib/server/logger';
import { startWorker } from '../../src/worker/worker';
import { testDb, testPool } from './helpers/db';
import { getTestDatabaseUrl } from './helpers/test-database-url';

const now = new Date('2026-11-01T12:00:00.000Z');
const expired = new Date(now.getTime() - 1);

const concurrent = createDb(getTestDatabaseUrl(), 5);

beforeEach(async () => {
	await testDb.delete(jobs);
});

afterAll(async () => {
	await testDb.delete(jobs);
	await concurrent.pool.end();
	await testPool.end();
});

async function insertRunningJob(values: Partial<typeof jobs.$inferInsert> = {}) {
	const [job] = await testDb
		.insert(jobs)
		.values({
			type: 'overdue_next_steps',
			queue: 'default',
			payload: {},
			status: 'running',
			attempts: 1,
			lockedBy: 'dead-worker',
			lockedUntil: expired,
			...values
		})
		.returning();

	if (!job) {
		throw new Error('Test job was not created.');
	}

	await testDb
		.insert(jobAttempts)
		.values({ jobId: job.id, attemptNumber: job.attempts, workerId: 'dead-worker' });

	return job;
}

async function storedJob(id: string) {
	const [job] = await testDb.select().from(jobs).where(eq(jobs.id, id));
	return job;
}

async function attemptsOf(jobId: string) {
	const attempts = await testDb.select().from(jobAttempts).where(eq(jobAttempts.jobId, jobId));
	return attempts.toSorted((a, b) => a.attemptNumber - b.attemptNumber);
}

describe('recovering expired jobs', () => {
	test('returns the job to the queue and marks the attempt lost', async () => {
		const job = await insertRunningJob();
		const runAt = new Date(now.getTime() + 60_000);

		expect(await recoverExpiredJobs(testDb, now)).toEqual([
			{ jobId: job.id, type: job.type, attempt: 1, outcome: 'retrying', runAt }
		]);
		expect(await storedJob(job.id)).toMatchObject({
			status: 'queued',
			attempts: 1,
			runAt,
			lockedBy: null,
			lockedUntil: null,
			finishedAt: null
		});
		expect(await attemptsOf(job.id)).toMatchObject([
			{
				outcome: 'lost',
				finishedAt: now,
				error: 'The lock expired before the worker finished.'
			}
		]);
	});

	test('makes the job dead when it was on its last attempt', async () => {
		const job = await insertRunningJob({ attempts: 2, maxAttempts: 2 });

		expect(await recoverExpiredJobs(testDb, now)).toMatchObject([
			{ jobId: job.id, outcome: 'dead' }
		]);
		expect(await storedJob(job.id)).toMatchObject({ status: 'dead', finishedAt: now });
		expect(await attemptsOf(job.id)).toMatchObject([{ attemptNumber: 2, outcome: 'lost' }]);
	});

	test('leaves a job with a valid lock alone', async () => {
		const job = await insertRunningJob({ lockedUntil: now });

		expect(await recoverExpiredJobs(testDb, now)).toEqual([]);
		expect(await storedJob(job.id)).toMatchObject({ status: 'running', lockedBy: 'dead-worker' });
	});

	test('recovers each job once when workers recover at the same time', async () => {
		const inserted = await Promise.all(Array.from({ length: 10 }, () => insertRunningJob()));

		const recovered = (
			await Promise.all(Array.from({ length: 5 }, () => recoverExpiredJobs(concurrent.db, now)))
		).flat();

		expect(recovered.map((job) => job.jobId).toSorted()).toEqual(
			inserted.map((job) => job.id).toSorted()
		);

		for (const job of inserted) {
			expect(await attemptsOf(job.id)).toMatchObject([{ outcome: 'lost' }]);
		}
	});
});

describe('renewing a lock', () => {
	const claim = { workerId: 'dead-worker', attemptNumber: 1 };

	test('moves the expiry forward for the holder', async () => {
		const job = await insertRunningJob();

		expect(await renewJobLock(testDb, { ...claim, jobId: job.id }, 5000, now)).toBe('renewed');
		expect(await storedJob(job.id)).toMatchObject({
			lockedUntil: new Date(now.getTime() + 5000)
		});
	});

	test('is refused for anyone else', async () => {
		const job = await insertRunningJob();

		expect(
			await renewJobLock(testDb, { ...claim, jobId: job.id, workerId: 'other' }, 5000, now)
		).toBe('lock_lost');
		expect(await storedJob(job.id)).toMatchObject({ lockedUntil: expired });
	});
});

describe('killing the worker mid-job', () => {
	let child: ChildProcess | undefined;

	afterEach(() => {
		child?.kill('SIGKILL');
		vi.restoreAllMocks();
	});

	test(
		'loses nothing: another worker recovers and finishes the job',
		{ timeout: 30_000 },
		async () => {
			vi.spyOn(logger, 'warn').mockImplementation(() => {});

			const [job] = await testDb
				.insert(jobs)
				.values({ type: 'overdue_next_steps', queue: 'default', payload: {} })
				.returning();

			if (!job) {
				throw new Error('Test job was not created.');
			}

			const worker = spawn(
				process.execPath,
				[
					'--import',
					'tsx',
					fileURLToPath(new URL('./helpers/killable-worker.ts', import.meta.url))
				],
				{
					env: { ...process.env, DATABASE_URL: getTestDatabaseUrl() },
					stdio: ['ignore', 'pipe', 'inherit']
				}
			);
			child = worker;

			await new Promise<void>((resolve, reject) => {
				worker.stdout?.on('data', (data: Buffer) => {
					if (data.toString().includes('handler started')) {
						resolve();
					}
				});
				worker.once('exit', (code) => reject(new Error(`The worker exited early: ${code}`)));
			});

			const exited = new Promise((resolve) => worker.once('exit', resolve));
			worker.kill('SIGKILL');
			await exited;

			expect(await storedJob(job.id)).toMatchObject({ status: 'running', attempts: 1 });

			const handler = vi.fn(async () => {});
			const rescuer = startWorker({
				db: concurrent.db,
				workerId: 'rescuing-worker',
				handlers: { overdue_next_steps: handler },
				concurrency: { default: 1, ai: 0 },
				pollIntervalMs: 20,
				lockDurationMs: 60_000,
				renewIntervalMs: 20_000,
				recoveryIntervalMs: 50
			});

			try {
				await vi.waitFor(async () => expect((await storedJob(job.id))?.status).toBe('queued'), {
					timeout: 10_000,
					interval: 50
				});

				// Skip the wait before the next attempt.
				await testDb.update(jobs).set({ runAt: new Date() }).where(eq(jobs.id, job.id));

				await vi.waitFor(async () => expect((await storedJob(job.id))?.status).toBe('succeeded'), {
					timeout: 5000,
					interval: 50
				});
			} finally {
				await rescuer.stop(1000);
			}

			expect(handler).toHaveBeenCalledOnce();
			expect(await attemptsOf(job.id)).toMatchObject([
				{ attemptNumber: 1, outcome: 'lost' },
				{ attemptNumber: 2, workerId: 'rescuing-worker', outcome: 'succeeded' }
			]);
		}
	);
});
