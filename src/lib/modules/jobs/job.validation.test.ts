import { expect, test } from 'vitest';

import { DEFAULT_MAX_JOB_ATTEMPTS, jobQueues } from './job.constants';
import { enqueueJobSchema, jobQueueByType, jobSchema } from './job.validation';

const job = { type: 'overdue_next_steps', payload: {} };

test('accepts a known job', () => {
	expect(jobSchema.parse(job)).toEqual(job);
});

test('rejects an unknown job type', () => {
	expect(jobSchema.safeParse({ type: 'send_rockets', payload: {} }).success).toBe(false);
});

test('rejects a payload that does not fit the job type', () => {
	expect(jobSchema.safeParse({ ...job, payload: { ticketId: 'x' } }).success).toBe(false);
	expect(jobSchema.safeParse({ type: job.type }).success).toBe(false);
});

test('keeps the options of an enqueued job', () => {
	const runAt = new Date('2026-11-01T00:00:00Z');

	expect(enqueueJobSchema.parse({ ...job, runAt, maxAttempts: 2, dedupeKey: ' key ' })).toEqual({
		...job,
		runAt,
		maxAttempts: 2,
		dedupeKey: 'key'
	});
});

test.each([
	['no attempts', { maxAttempts: 0 }],
	['a blank dedupe key', { dedupeKey: ' \n ' }],
	['a dedupe key over 200 characters', { dedupeKey: 'x'.repeat(201) }]
])('rejects %s', (_, options) => {
	expect(enqueueJobSchema.safeParse({ ...job, ...options }).success).toBe(false);
});

test('every job type has a known queue', () => {
	for (const queue of Object.values(jobQueueByType)) {
		expect(jobQueues).toContain(queue);
	}
	expect(DEFAULT_MAX_JOB_ATTEMPTS).toBeGreaterThan(0);
});
