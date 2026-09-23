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

/**
 * Ticket priorities.
 */
export const ticketPriorities = ['low', 'medium', 'high', 'critical'] as const;

/**
 * Supported ticket creation channels.
 */
export const ticketSources = ['manual', 'email', 'web', 'api'] as const;
