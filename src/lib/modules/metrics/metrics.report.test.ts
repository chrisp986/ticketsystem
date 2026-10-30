import { expect, test } from 'vitest';

import { formatDuration, formatMetricsReport } from './metrics.report';

test.each([
	[45, '45 s'],
	[60, '1 min'],
	[3599, '1 h 0 min'],
	[3600, '1 h 0 min'],
	[5400, '1 h 30 min'],
	[86_400, '1 d 0 h'],
	[97_200, '1 d 3 h']
])('formats %i seconds as %s', (seconds, expected) => {
	expect(formatDuration(seconds)).toBe(expected);
});

test('the report shows the numbers of a period', () => {
	const report = formatMetricsReport(
		{
			closedTickets: 2,
			actionsPerTicket: { median: 3, average: 3.5 },
			timeToFirstAction: { median: 60, average: 120 },
			timeToResolution: null,
			timeToClose: { median: 3600, average: 7200 },
			reopenRate: 0.5,
			overdueShare: null
		},
		{ from: '2026-11-01', to: '2026-12-01' }
	);

	expect(report).toContain('from 2026-11-01 up to, not including, 2026-12-01: 2');
	expect(report).toContain('| Actions per ticket | 3.0 | 3.5 |');
	expect(report).toContain('| Time to first action | 1 min | 2 min |');
	expect(report).toContain('| Time to resolution | — | — |');
	expect(report).toContain('| Time to close | 1 h 0 min | 2 h 0 min |');
	expect(report).toContain('Reopen rate: 50.0 %');
	expect(report).toContain('Overdue next steps among open tickets now: —');
});
