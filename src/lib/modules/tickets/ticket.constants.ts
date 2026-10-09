/**
 * Ticket business constants.
 *
 * These values are shared by:
 * - Drizzle database schema
 * - TypeScript types
 * - Zod validation
 * - Frontend components
 * - AI agent tools
 */

/**
 * Ticket lifecycle statuses.
 */
export const ticketStatuses = [
	'new',
	'in_progress',
	'waiting_customer',
	'waiting_internal',
	'resolved',
	'closed'
] as const;

export const ticketStatusLabels = {
	new: 'New',
	in_progress: 'In progress',
	waiting_customer: 'Waiting for customer',
	waiting_internal: 'Waiting internally',
	resolved: 'Resolved',
	closed: 'Closed'
} satisfies Record<(typeof ticketStatuses)[number], string>;

export const resolvingResolutions = ['solved', 'workaround'] as const;

export const closingResolutions = [
	'duplicate',
	'not_actionable',
	'withdrawn',
	'no_response',
	'wont_fix'
] as const;

export const ticketResolutions = [...resolvingResolutions, ...closingResolutions] as const;

/**
 * How a ticket ended. Separate from the status (ADR 0001).
 */

export const ticketResolutionLabels = {
	solved: 'Solved',
	workaround: 'Workaround',
	duplicate: 'Duplicate',
	not_actionable: 'Not actionable',
	withdrawn: 'Withdrawn',
	no_response: 'No response',
	wont_fix: "Won't fix"
} satisfies Record<(typeof ticketResolutions)[number], string>;

/**
 * Ticket priorities.
 */
export const ticketPriorities = ['low', 'medium', 'high', 'critical'] as const;

/**
 * Supported ticket creation channels.
 */
export const ticketSources = ['manual', 'email', 'web', 'api'] as const;

/**
 * Who made a change (ADR 0001).
 */
export const actorTypes = ['user', 'system', 'ai'] as const;
