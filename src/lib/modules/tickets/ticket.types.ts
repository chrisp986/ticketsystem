import type { z } from 'zod';

import {
	actorTypes,
	assignmentFields,
	ticketPriorities,
	ticketResolutions,
	ticketSources,
	ticketStatuses,
	attentionReasons,
	attentionEventTypes,
	attentionClearTypes,
	ticketViews
} from './ticket.constants';

import type {
	createTicketSchema,
	// ticketSchema,
	updateTicketStatusSchema
} from './ticket.validation';

/**
 * Ticket business types.
 *
 * Automatically derived from the constants.
 */

export type TicketStatus = (typeof ticketStatuses)[number];

export type TicketResolution = (typeof ticketResolutions)[number];

export type TicketPriority = (typeof ticketPriorities)[number];

export type TicketSource = (typeof ticketSources)[number];

export type AttentionReason = (typeof attentionReasons)[number];

export type AttentionEventType = (typeof attentionEventTypes)[number];

export type AttentionClearType = (typeof attentionClearTypes)[number];

export type AssignmentField = (typeof assignmentFields)[number];

export type TicketView = (typeof ticketViews)[number];

/**
 * Complete ticket.
 *
 * Derived from the runtime validation schema.
 *
 *export type Ticket = z.infer<typeof ticketSchema>;
 */
/**
 * Input for creating a ticket.
 *
 * Represents data AFTER Zod validation
 * and default values have been applied.
 */
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

/**
 * Input for changing the ticket status.
 */
export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;

export type ActorType = (typeof actorTypes)[number];

/**
 * Who made a change: a person by user ID, the system or AI by name (ADR 0009).
 */
export type Actor =
	{ type: 'user'; id: string } | { type: Exclude<ActorType, 'user'>; name: string };
