import { describe, expect, test } from 'vitest';

import { jobRetryDelayMs } from './job.backoff';

const minute = 60 * 1000;

describe('jobRetryDelayMs', () => {
	test.each([
		[1, minute],
		[2, 5 * minute],
		[3, 25 * minute],
		[4, 120 * minute],
		[5, 120 * minute],
		[50, 120 * minute]
	])('after attempt %i', (attemptNumber, delay) => {
		expect(jobRetryDelayMs(attemptNumber)).toBe(delay);
	});
});
