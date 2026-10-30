import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { MetricSummary, TicketMetrics } from '../../modules/metrics/metrics.report';
import { ticketAssignmentHistory } from '../db/schema/ticket-assignment-history';
import { ticketAttentionEvents } from '../db/schema/ticket-attention-events';
import { ticketNotes } from '../db/schema/ticket-notes';
import { ticketStatusHistory } from '../db/schema/ticket-status-history';
import { tickets } from '../db/schema/tickets';

type MetricsRow = {
	closed_tickets: number;
	actions_median: number | null;
	actions_average: number | null;
	first_action_median: number | null;
	first_action_average: number | null;
	resolution_median: number | null;
	resolution_average: number | null;
	close_median: number | null;
	close_average: number | null;
	reopen_rate: number | null;
	overdue_share: number | null;
};

function summary(median: number | null, average: number | null): MetricSummary {
	return median === null || average === null ? null : { median, average };
}

/**
 * The metrics of tickets closed from `from` up to, not including, `to` (ADR 0010). Read-only.
 *
 * `UNION` removes duplicates, so the rows of one change, which share a timestamp, are one action.
 */
export async function computeMetrics(
	database: NodePgDatabase,
	period: { from: Date; to: Date },
	now: Date = new Date()
): Promise<TicketMetrics> {
	const { rows } = await database.execute<MetricsRow>(sql`
		WITH cohort AS (
			SELECT
				${tickets.id} AS id,
				${tickets.createdAt} AS created_at,
				${tickets.closedAt} AS closed_at,
				${tickets.firstResolvedAt} AS first_resolved_at,
				${tickets.reopenCount} AS reopen_count
			FROM ${tickets}
			WHERE ${tickets.closedAt} >= ${period.from}::timestamptz
				AND ${tickets.closedAt} < ${period.to}::timestamptz
		),
		actions AS (
			SELECT ${tickets.id} AS ticket_id, ${tickets.createdById} AS user_id, ${tickets.createdAt} AS at
			FROM ${tickets}
			WHERE ${tickets.createdByType} = 'user'
			UNION
			SELECT ${ticketStatusHistory.ticketId}, ${ticketStatusHistory.actorId}, ${ticketStatusHistory.changedAt}
			FROM ${ticketStatusHistory}
			WHERE ${ticketStatusHistory.actorType} = 'user'
			UNION
			SELECT ${ticketAttentionEvents.ticketId}, ${ticketAttentionEvents.actorId}, ${ticketAttentionEvents.occurredAt}
			FROM ${ticketAttentionEvents}
			WHERE ${ticketAttentionEvents.actorType} = 'user'
			UNION
			SELECT ${ticketAssignmentHistory.ticketId}, ${ticketAssignmentHistory.actorId}, ${ticketAssignmentHistory.changedAt}
			FROM ${ticketAssignmentHistory}
			WHERE ${ticketAssignmentHistory.actorType} = 'user'
			UNION
			SELECT ${ticketNotes.ticketId}, ${ticketNotes.authorId}, ${ticketNotes.createdAt}
			FROM ${ticketNotes}
		),
		per_ticket AS (
			SELECT
				cohort.id,
				count(actions.at)::float8 AS actions,
				extract(epoch FROM min(actions.at) FILTER (WHERE actions.at > cohort.created_at) - cohort.created_at)::float8 AS first_action,
				extract(epoch FROM cohort.first_resolved_at - cohort.created_at)::float8 AS resolution,
				extract(epoch FROM cohort.closed_at - cohort.created_at)::float8 AS close,
				cohort.reopen_count
			FROM cohort
			LEFT JOIN actions ON actions.ticket_id = cohort.id AND actions.at <= cohort.closed_at
			GROUP BY cohort.id, cohort.created_at, cohort.closed_at, cohort.first_resolved_at, cohort.reopen_count
		)
		SELECT
			count(*)::int AS closed_tickets,
			percentile_cont(0.5) WITHIN GROUP (ORDER BY actions) AS actions_median,
			avg(actions) AS actions_average,
			percentile_cont(0.5) WITHIN GROUP (ORDER BY first_action) AS first_action_median,
			avg(first_action) AS first_action_average,
			percentile_cont(0.5) WITHIN GROUP (ORDER BY resolution) AS resolution_median,
			avg(resolution) AS resolution_average,
			percentile_cont(0.5) WITHIN GROUP (ORDER BY close) AS close_median,
			avg(close) AS close_average,
			avg((reopen_count > 0)::int)::float8 AS reopen_rate,
			(
				SELECT avg((${tickets.nextStepDue} < ${now}::timestamptz)::int)::float8
				FROM ${tickets}
				WHERE ${tickets.status} <> 'closed'
			) AS overdue_share
		FROM per_ticket
	`);

	const [row] = rows;

	if (!row) {
		throw new Error('Computing metrics returned no row.');
	}

	return {
		closedTickets: row.closed_tickets,
		actionsPerTicket: summary(row.actions_median, row.actions_average),
		timeToFirstAction: summary(row.first_action_median, row.first_action_average),
		timeToResolution: summary(row.resolution_median, row.resolution_average),
		timeToClose: summary(row.close_median, row.close_average),
		reopenRate: row.reopen_rate,
		overdueShare: row.overdue_share
	};
}
