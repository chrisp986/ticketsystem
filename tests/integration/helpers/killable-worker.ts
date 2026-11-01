/**
 * A real worker process for the test that kills one. Its only job never finishes.
 *
 * Run with `node --import tsx`, so the killed process is the worker itself and not a wrapper.
 */
import { createDb } from '../../../src/lib/server/db/create-db';
import { startWorker } from '../../../src/worker/worker';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
	throw new Error('DATABASE_URL is required.');
}

const { db } = createDb(connectionString, 3);

startWorker({
	db,
	workerId: `killable-worker:${process.pid}`,
	handlers: {
		overdue_next_steps: async () => {
			console.log('handler started');
			await new Promise(() => {});
		}
	},
	concurrency: { default: 1, ai: 0 },
	pollIntervalMs: 20,
	lockDurationMs: 1000,
	renewIntervalMs: 200,
	recoveryIntervalMs: 60_000,
	recurringJobs: []
});
