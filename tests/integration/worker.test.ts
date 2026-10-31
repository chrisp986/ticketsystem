import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { createDb } from '../../src/lib/server/db/create-db';
import { jobAttempts, jobs } from '../../src/lib/server/db/schema/jobs';
import { logger } from '../../src/lib/server/logger';
import { startWorker } from '../../src/worker/worker';
import type { JobHandlers, Worker, WorkerOptions } from '../../src/worker/worker';
import { testDb, testPool } from './helpers/db';
import { getTestDatabaseUrl } from './helpers/test-database-url';

const { db, pool } = createDb(getTestDatabaseUrl(), 5);

const running: Worker[] = [];

beforeEach(async () => {
	await testDb.delete(jobs);
	vi.spyOn(logger, 'info').mockImplementation(() => {});
	vi.spyOn(logger, 'warn').mockImplementation(() => {});
	vi.spyOn(logger, 'error').mockImplementation(() => {});
});

afterEach(async () => {
	await Promise.all(running.splice(0).map((worker) => worker.stop(1000)));
	vi.restoreAllMocks();
});

afterAll(async () => {
	await testDb.delete(jobs);
	await pool.end();
	await testPool.end();
});

function start(handler: JobHandlers['overdue_next_steps'], options: Partial<WorkerOptions> = {}) {
	const worker = startWorker({
		db,
		workerId: 'test-worker',
		handlers: { overdue_next_steps: handler },
		concurrency: { default: 1, ai: 0 },
		pollIntervalMs: 10,
		lockDurationMs: 60_000,
		...options
	});

	running.push(worker);
	return worker;
}

async function insertJob(values: Partial<typeof jobs.$inferInsert> = {}) {
	const [job] = await testDb
		.insert(jobs)
		.values({ type: 'overdue_next_steps', queue: 'default', payload: {}, ...values })
		.returning();

	if (!job) {
		throw new Error('Test job was not created.');
	}

	return job;
}

async function statusOf(id: string) {
	const [job] = await testDb.select().from(jobs).where(eq(jobs.id, id));
	return job?.status;
}

async function attemptsOf(jobId: string) {
	return testDb.select().from(jobAttempts).where(eq(jobAttempts.jobId, jobId));
}

function deferred() {
	let resolve = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});

	return { promise, resolve };
}

describe('running jobs', () => {
	test('passes the payload to the handler and records the success', async () => {
		const job = await insertJob();
		const handler = vi.fn(async () => {});

		start(handler);

		await vi.waitFor(async () => expect(await statusOf(job.id)).toBe('succeeded'));
		expect(handler).toHaveBeenCalledExactlyOnceWith({}, { db });
	});

	test('records a failing handler and keeps running', async () => {
		const failing = await insertJob({ runAt: new Date(Date.now() - 1000) });
		const next = await insertJob();
		const handler = vi
			.fn<JobHandlers['overdue_next_steps']>()
			.mockRejectedValueOnce(new Error('The mail server is down.'))
			.mockResolvedValue();

		start(handler);

		await vi.waitFor(async () => expect(await statusOf(next.id)).toBe('succeeded'));
		expect(await statusOf(failing.id)).toBe('dead');
		expect(await attemptsOf(failing.id)).toMatchObject([
			{ outcome: 'failed', error: 'The mail server is down.' }
		]);
	});

	test('fails an invalid payload without running it or storing its content', async () => {
		const job = await insertJob({ payload: { customer: 'Jane Doe' } });
		const handler = vi.fn(async () => {});

		start(handler);

		await vi.waitFor(async () => expect(await statusOf(job.id)).toBe('dead'));
		expect(handler).not.toHaveBeenCalled();
		expect(await attemptsOf(job.id)).toMatchObject([
			{ outcome: 'failed', error: 'The job type or payload is invalid.' }
		]);
		expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain('Jane Doe');
	});

	test('fails an unknown job type', async () => {
		const job = await insertJob({ type: 'no_longer_exists' });

		start(async () => {});

		await vi.waitFor(async () => expect(await statusOf(job.id)).toBe('dead'));
	});

	test('runs no more jobs at once than the concurrency allows', async () => {
		const inserted = await Promise.all(Array.from({ length: 5 }, () => insertJob()));
		let active = 0;
		let highest = 0;

		start(
			async () => {
				active += 1;
				highest = Math.max(highest, active);
				await new Promise((resolve) => setTimeout(resolve, 30));
				active -= 1;
			},
			{ concurrency: { default: 2, ai: 0 } }
		);

		await vi.waitFor(
			async () => {
				for (const job of inserted) {
					expect(await statusOf(job.id)).toBe('succeeded');
				}
			},
			{ timeout: 5000 }
		);
		expect(highest).toBe(2);
	});

	test('a slow job on one queue does not hold up another queue', async () => {
		const slow = await insertJob({ queue: 'ai' });
		const fast = await insertJob();
		const release = deferred();
		let calls = 0;

		start(
			async () => {
				// Only the first job to start stays open; the other must still finish.
				calls += 1;
				await (calls === 1 ? release.promise : Promise.resolve());
			},
			{ concurrency: { default: 1, ai: 1 } }
		);

		await vi.waitFor(async () => {
			const statuses = [await statusOf(slow.id), await statusOf(fast.id)];
			expect(statuses.toSorted()).toEqual(['running', 'succeeded']);
		});

		release.resolve();
		await vi.waitFor(async () => {
			expect(await statusOf(slow.id)).toBe('succeeded');
			expect(await statusOf(fast.id)).toBe('succeeded');
		});
	});

	test('does not turn a success into a failure when recording it fails', async () => {
		const job = await insertJob();
		const started = deferred();
		const release = deferred();
		const flaky = createDb(getTestDatabaseUrl(), 2);

		const worker = start(
			async () => {
				started.resolve();
				await release.promise;
			},
			{ db: flaky.db }
		);

		await started.promise;
		await flaky.pool.end();
		release.resolve();

		await vi.waitFor(() =>
			expect(logger.error).toHaveBeenCalledWith(
				'job result could not be recorded',
				expect.objectContaining({ jobId: job.id })
			)
		);
		expect(logger.error).not.toHaveBeenCalledWith('job failed', expect.anything());
		expect(await statusOf(job.id)).toBe('running');
		expect(await worker.stop(1000)).toBe('stopped');
	});

	test('survives a database failure while claiming', async () => {
		const broken = createDb(getTestDatabaseUrl(), 1);
		await broken.pool.end();

		const worker = start(async () => {}, { db: broken.db });

		await vi.waitFor(() =>
			expect(logger.error).toHaveBeenCalledWith(
				'job claim failed',
				expect.objectContaining({ queue: 'default' })
			)
		);
		expect(await worker.stop(1000)).toBe('stopped');
	});
});

describe('stopping', () => {
	test('waits for a running job and claims nothing more', async () => {
		const job = await insertJob();
		const started = deferred();
		const release = deferred();

		const worker = start(async () => {
			started.resolve();
			await release.promise;
		});

		await started.promise;

		const queued = await insertJob();
		const stopped = worker.stop(5000);

		release.resolve();

		expect(await stopped).toBe('stopped');
		expect(await statusOf(job.id)).toBe('succeeded');
		expect(await statusOf(queued.id)).toBe('queued');
	});

	test('gives up after the timeout and leaves the job running', async () => {
		const job = await insertJob();
		const started = deferred();
		const release = deferred();

		const worker = start(async () => {
			started.resolve();
			await release.promise;
		});

		await started.promise;

		expect(await worker.stop(10)).toBe('timed_out');
		expect(await statusOf(job.id)).toBe('running');

		release.resolve();
		expect(await worker.stop(1000)).toBe('stopped');
	});

	test('stops an idle worker at once', async () => {
		const worker = start(async () => {}, { pollIntervalMs: 60_000 });

		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(await worker.stop(1000)).toBe('stopped');
	});
});
