/**
 * A median and an average, or null when no ticket has a value.
 */
export type MetricSummary = { median: number; average: number } | null;

/**
 * The metrics of tickets closed in a period (ADR 0010). Durations are in seconds, shares from 0 to 1.
 */
export type TicketMetrics = {
	closedTickets: number;
	actionsPerTicket: MetricSummary;
	timeToFirstAction: MetricSummary;
	timeToResolution: MetricSummary;
	timeToClose: MetricSummary;
	reopenRate: number | null;
	overdueShare: number | null;
};

const NO_VALUE = '—';

export function formatDuration(seconds: number): string {
	const minutes = Math.round(seconds / 60);

	if (seconds < 60) {
		return `${Math.round(seconds)} s`;
	}

	if (minutes < 60) {
		return `${minutes} min`;
	}

	if (minutes < 24 * 60) {
		return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
	}

	const hours = Math.round(minutes / 60);

	return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

function formatShare(share: number | null): string {
	return share === null ? NO_VALUE : `${(share * 100).toFixed(1)} %`;
}

function summaryCells(summary: MetricSummary, format: (value: number) => string): string {
	return summary
		? `${format(summary.median)} | ${format(summary.average)}`
		: `${NO_VALUE} | ${NO_VALUE}`;
}

/**
 * The report as Markdown, ready for a file in `docs/metrics/` (ADR 0010).
 */
export function formatMetricsReport(
	metrics: TicketMetrics,
	period: { from: string; to: string }
): string {
	const count = (value: number) => value.toFixed(1);

	return [
		`Tickets closed from ${period.from} up to, not including, ${period.to}: ${metrics.closedTickets}`,
		'',
		'| Metric | Median | Average |',
		'| --- | --- | --- |',
		`| Actions per ticket | ${summaryCells(metrics.actionsPerTicket, count)} |`,
		`| Time to first action | ${summaryCells(metrics.timeToFirstAction, formatDuration)} |`,
		`| Time to resolution | ${summaryCells(metrics.timeToResolution, formatDuration)} |`,
		`| Time to close | ${summaryCells(metrics.timeToClose, formatDuration)} |`,
		'',
		`Reopen rate: ${formatShare(metrics.reopenRate)}`,
		`Overdue next steps among open tickets now: ${formatShare(metrics.overdueShare)}`
	].join('\n');
}
