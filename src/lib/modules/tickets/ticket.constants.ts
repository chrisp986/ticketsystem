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

/**
 * Ticket priorities.
 */
export const ticketPriorities = ['low', 'medium', 'high', 'critical'] as const;

/**
 * Supported ticket creation channels.
 */
export const ticketSources = ['manual', 'email', 'web', 'api'] as const;
