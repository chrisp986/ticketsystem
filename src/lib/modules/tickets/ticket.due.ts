import { addBusinessMinutes, minutesPerWorkingDay } from '../time/business-time';
import type { TicketPriority, TicketStatus } from '../tickets/ticket.types';

const hour = 60;
const workingDay = minutesPerWorkingDay;

/**
 * Target for in_progress tickets, by priority (ADR 0006).
 */
const inProgressTargets: Record<TicketPriority, number> = {
	critical: 2 * hour,
	high: 4 * hour,
	medium: workingDay,
	low: 2 * workingDay
};

/**
 * Targets for the other open statuses (ADR 0006).
 */
const statusTargets: Record<Exclude<TicketStatus, 'in_progress' | 'closed'>, number> = {
	new: hour,
	waiting_customer: 3 * workingDay,
	waiting_internal: 2 * workingDay,
	resolved: 5 * workingDay
};

/**
 * Pre-filled next step per status. Null means the agent writes it.
 */
export const defaultNextSteps: Record<TicketStatus, string | null> = {
	new: 'Triage the request',
	in_progress: null,
	waiting_customer: 'Follow up if the customer has not replied',
	waiting_internal: null,
	resolved: 'Await confirmation, then close',
	closed: null
};

/**
 * Default due date for the next step, in business time.
 * Closed tickets have no next step.
 */
export function defaultNextStepDue(
	status: TicketStatus,
	priority: TicketPriority,
	now: Date
): Date | null {
	if (status === 'closed') {
		return null;
	}

	const minutes = status === 'in_progress' ? inProgressTargets[priority] : statusTargets[status];

	return addBusinessMinutes(now, minutes);
}
