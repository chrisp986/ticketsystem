import { z } from 'zod';

import { ticketPriorities, ticketSources, ticketStatuses } from './ticket.constants';

/**
 * Reusable validation for individual ticket fields.
 */

export const ticketStatusSchema = z.enum(ticketStatuses);

export const ticketPrioritySchema = z.enum(ticketPriorities);

export const ticketSourceSchema = z.enum(ticketSources);

/**
 * Complete ticket.
 *
 * This represents the application-facing
 * ticket model after database retrieval.
 */
export const ticketSchema = z.object({
	id: z.uuid(),

	subject: z.string().trim().min(1).max(200),

	description: z.string().nullable(),

	status: ticketStatusSchema,

	priority: ticketPrioritySchema,

	source: ticketSourceSchema,

	tags: z.array(z.string()),

	version: z.number().int().positive(),

	resolvedAt: z.date().nullable(),

	closedAt: z.date().nullable(),

	createdAt: z.date(),

	updatedAt: z.date()
});

/**
 * Input for creating a new ticket.
 *
 * The database generates the ID and timestamps.
 * The service controls lifecycle state and version.
 */
export const createTicketSchema = z.object({
	subject: z.string().trim().min(1, 'Subject is required').max(200, 'Subject is too long'),

	description: z.string().trim().nullable().optional(),

	priority: ticketPrioritySchema.default('medium'),

	source: ticketSourceSchema.default('manual'),

	tags: z.array(z.string()).default([])
});

/**
 * Input for changing a ticket's status.
 *
 * The version is used for optimistic
 * concurrency control.
 */
export const updateTicketStatusSchema = z.object({
	ticketId: z.uuid(),

	status: ticketStatusSchema,

	expectedVersion: z.number().int().positive()
});
