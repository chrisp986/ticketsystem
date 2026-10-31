/**
 * The worker process: runs background jobs, separate from the web app (ADR 0003).
 *
 * Usage: pnpm worker
 */
import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

import { parseServerConfig } from '../lib/server/config';
import { createDb } from '../lib/server/db/create-db';
import { logger, setLogLevel } from '../lib/server/logger';
import { jobHandlers } from './handlers';
import { startWorker } from './worker';

const POLL_INTERVAL_MS = 1000;
const LOCK_DURATION_MS = 5 * 60 * 1000;
const RENEW_INTERVAL_MS = LOCK_DURATION_MS / 3;
const RECOVERY_INTERVAL_MS = 30 * 1000;
const SHUTDOWN_TIMEOUT_MS = 30 * 1000;

// AI runs on the CPU, so one job at a time.
const CONCURRENCY = { default: 2, ai: 1 };

async function main() {
	const config = parseServerConfig(process.env);
	setLogLevel(config.LOG_LEVEL);

	const { db, pool } = createDb(config.DATABASE_URL);
	const workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

	const worker = startWorker({
		db,
		workerId,
		handlers: jobHandlers,
		concurrency: CONCURRENCY,
		pollIntervalMs: POLL_INTERVAL_MS,
		lockDurationMs: LOCK_DURATION_MS,
		renewIntervalMs: RENEW_INTERVAL_MS,
		recoveryIntervalMs: RECOVERY_INTERVAL_MS
	});

	logger.info('worker started', { workerId, concurrency: CONCURRENCY });

	let shuttingDown = false;

	async function shutDown(signal: string) {
		if (shuttingDown) {
			process.exit(1);
		}

		shuttingDown = true;
		logger.info('worker stopping', { workerId, signal });

		const outcome = await worker.stop(SHUTDOWN_TIMEOUT_MS);

		if (outcome === 'timed_out') {
			logger.warn('worker stopped with jobs still running', { workerId });
			process.exit(1);
		}

		await pool.end();
		logger.info('worker stopped', { workerId });
	}

	process.on('SIGTERM', () => void shutDown('SIGTERM'));
	process.on('SIGINT', () => void shutDown('SIGINT'));
}

main().catch((err: unknown) => {
	logger.error('worker could not start', { err });
	process.exitCode = 1;
});
