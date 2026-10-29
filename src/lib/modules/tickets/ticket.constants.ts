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
 * Views of the ticket list.
 */
export const ticketViews = ['all', 'action', 'attention', 'overdue'] as const;

export const ticketViewLabels = {
	all: 'All tickets',
	action: 'Needs action',
	attention: 'Needs attention',
	overdue: 'Overdue'
} satisfies Record<(typeof ticketViews)[number], string>;

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
 * Why a ticket needs a human now (ADR 0002).
 */
export const attentionReasons = [
	'new_ticket',
	'customer_reply',
	'reopened',
	'bounce',
	'next_step_overdue'
] as const;

export const attentionReasonLabels = {
	new_ticket: 'New ticket',
	customer_reply: 'Customer replied',
	reopened: 'Reopened',
	bounce: 'Email bounced',
	next_step_overdue: 'Next step overdue'
} satisfies Record<(typeof attentionReasons)[number], string>;

export const attentionEventTypes = ['raised', 'cleared'] as const;

/**
 * How attention was cleared (ADR 0002).
 */
export const attentionClearTypes = ['reply', 'status_change', 'manual'] as const;

export const attentionClearTypeLabels = {
	reply: 'by a reply',
	status_change: 'by a status change',
	manual: 'as handled'
} satisfies Record<(typeof attentionClearTypes)[number], string>;
/**
 * Ticket priorities.
 */
export const ticketPriorities = ['low', 'medium', 'high', 'critical'] as const;

/**
 * Supported ticket creation channels.
 */
export const ticketSources = ['manual', 'email', 'web', 'api'] as const;

/**
 * Who made a change (ADR 0001, ADR 0009).
 */
export const actorTypes = ['user', 'system', 'ai'] as const;

export const actorTypeLabels = {
	user: 'User',
	system: 'System',
	ai: 'AI'
} satisfies Record<(typeof actorTypes)[number], string>;

/**
 * Ownership fields tracked in the assignment history (ADR 0008).
 */
export const assignmentFields = ['assignee', 'next_step_owner'] as const;

export const assignmentFieldLabels = {
	assignee: 'Assignee',
	next_step_owner: 'Next-step owner'
} satisfies Record<(typeof assignmentFields)[number], string>;

/**
 * Kinds of manual ticket notes (ADR 0005).
 */
export const ticketNoteKinds = ['internal_note', 'phone_call', 'on_site'] as const;

export const ticketNoteKindLabels = {
	internal_note: 'Internal note',
	phone_call: 'Phone call',
	on_site: 'On site'
} satisfies Record<(typeof ticketNoteKinds)[number], string>;

/**
 * Longest note text, enforced in validation and the database (ADR 0005).
 */
export const TICKET_NOTE_MAX_LENGTH = 10000;
