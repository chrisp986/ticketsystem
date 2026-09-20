import type { z } from 'zod';

import { ticketPriorities, ticketSources, ticketStatuses } from './ticket.constants';

import type {
	createTicketSchema,
	ticketSchema,
	updateTicketStatusSchema
} from './ticket.validation';

/**
 * Ticket business types.
 *
 * Automatically derived from the constants.
 */

export type TicketStatus = (typeof ticketStatuses)[number];

export type TicketPriority = (typeof ticketPriorities)[number];

export type TicketSource = (typeof ticketSources)[number];

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
