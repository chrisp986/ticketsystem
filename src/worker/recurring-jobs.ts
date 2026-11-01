import type { RecurringJob } from './worker';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export const recurringJobs: RecurringJob[] = [
	{
		intervalMs: FIVE_MINUTES_MS,
		// One attempt: a retry would keep the dedupe key and block fresher runs, and the next
		// run repeats the work anyway (ADR 0011).
		job: {
			type: 'overdue_next_steps',
			payload: {},
			dedupeKey: 'overdue_next_steps',
			maxAttempts: 1
		}
	}
];
