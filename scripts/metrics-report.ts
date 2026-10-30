/**
 * Prints the metrics of tickets closed in a period as Markdown (ADR 0010).
 *
 * Usage: pnpm metrics:report --from 2026-11-01 --to 2026-12-01
 * Dates are in Berlin time; the end date is not included. The script only reads.
 */
import 'dotenv/config';

import { parseArgs } from 'node:util';

import { z } from 'zod';

import { formatMetricsReport } from '../src/lib/modules/metrics/metrics.report';
import { fromLocalInputValue } from '../src/lib/modules/time/local-datetime';
import { parseServerConfig } from '../src/lib/server/config';
import { createDb } from '../src/lib/server/db/create-db';
import { computeMetrics } from '../src/lib/server/metrics/compute-metrics';

const argsSchema = z.object({ from: z.iso.date(), to: z.iso.date() });

function startOfDay(date: string): Date {
	const value = fromLocalInputValue(`${date}T00:00`);

	if (!value) {
		throw new Error(`Invalid date: ${date}`);
	}

	return value;
}

async function main() {
	const { values } = parseArgs({
		options: { from: { type: 'string' }, to: { type: 'string' } }
	});

	const args = argsSchema.safeParse(values);

	if (!args.success) {
		throw new Error(`Usage: pnpm metrics:report --from YYYY-MM-DD --to YYYY-MM-DD`);
	}

	const from = startOfDay(args.data.from);
	const to = startOfDay(args.data.to);

	if (to <= from) {
		throw new Error('The end date must be after the start date.');
	}

	const config = parseServerConfig(process.env);
	const { db, pool } = createDb(config.DATABASE_URL, 1);

	try {
		console.log(formatMetricsReport(await computeMetrics(db, { from, to }), args.data));
	} finally {
		await pool.end();
	}
}

main().catch((err: unknown) => {
	console.error(err instanceof Error ? err.message : err);
	process.exitCode = 1;
});
