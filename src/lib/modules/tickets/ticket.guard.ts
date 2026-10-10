import { isResolutionValid } from './ticket.resolution';
import { canTransition } from './ticket.transitions';
import type { TicketResolution, TicketStatus } from './ticket.types';

export type GuardBlockerCode = 'invalid_transition' | 'resolution_required';

export type GuardWarningCode = 'closing_without_summary' | 'repeated_reopen';

export type GuardIssue<Code extends string> = {
	code: Code;
	message: string;
};

export type GuardResult = {
	blockers: GuardIssue<GuardBlockerCode>[];
	warnings: GuardIssue<GuardWarningCode>[];
};

export type GuardTicket = {
	status: TicketStatus;
	reopenCount: number;
};

export type GuardChange = {
	to: TicketStatus;
	resolution?: TicketResolution;
	resolutionSummary?: string;
};

/**
 * Checks a status change against the lifecycle rules (ADR 0001).
 *
 * Blockers stop the change. Warnings allow it, but the agent should know.
 * Used by the ticket view for live feedback and by the server on submit.
 */
export function checkStatusChange(ticket: GuardTicket, change: GuardChange): GuardResult {
	const result: GuardResult = { blockers: [], warnings: [] };
	const { to, resolution, resolutionSummary } = change;

	if (!canTransition(ticket.status, to)) {
		result.blockers.push({
			code: 'invalid_transition',
			message: 'This status change is not allowed.'
		});

		return result;
	}

	const keepsResolution = ticket.status === 'resolved' && to === 'closed';

	if (!keepsResolution && !isResolutionValid(to, resolution, resolutionSummary)) {
		result.blockers.push({
			code: 'resolution_required',
			message:
				to === 'resolved'
					? 'Choose Solved or Workaround and write a summary.'
					: 'Choose a reason for closing.'
		});
	}

	if (to === 'closed' && !keepsResolution && !resolutionSummary?.trim()) {
		result.warnings.push({
			code: 'closing_without_summary',
			message: 'Closing without a summary leaves no explanation in the history.'
		});
	}

	if (ticket.status === 'resolved' && to === 'in_progress' && ticket.reopenCount > 0) {
		result.warnings.push({
			code: 'repeated_reopen',
			message: `This ticket has been reopened ${ticket.reopenCount} time(s) before. The fix may not be working.`
		});
	}

	return result;
}
