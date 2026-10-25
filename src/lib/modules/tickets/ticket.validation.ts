import { z } from 'zod';

import {
	ticketPriorities,
	ticketSources,
	ticketStatuses,
	ticketResolutions
} from './ticket.constants';

/**
 * Reusable validation for individual ticket fields.
 */

export const ticketStatusSchema = z.enum(ticketStatuses);

export const ticketPrioritySchema = z.enum(ticketPriorities);

export const ticketSourceSchema = z.enum(ticketSources);

export const ticketResolutionSchema = z.enum(ticketResolutions);

/**
 * An assignee or next-step owner. `null` clears the field, `undefined` keeps it.
 */
export const ownerIdSchema = z.uuid().nullable().optional();

/**
 * Complete ticket.
 *
 * This represents the application-facing
 * ticket model after database retrieval.
 */
// export const ticketSchema = z.object({
// 	id: z.uuid(),

// 	subject: z.string().trim(),

// 	description: z.string().nullable(),

// 	status: ticketStatusSchema,

// 	priority: ticketPrioritySchema,

// 	source: ticketSourceSchema,

// 	tags: z.array(z.string()),

// 	version: z.number().int().positive(),

// 	resolvedAt: z.date().nullable(),

// 	closedAt: z.date().nullable(),

// 	createdAt: z.date(),

// 	updatedAt: z.date()
// });

/**
 * Input for creating a new ticket.
 *
 * The database generates the ID and timestamps.
 * The service controls lifecycle state and version.
 */
export const createTicketSchema = z.object({
	subject: z.string().trim(),
	description: z.string().trim().nullable().optional(),
	priority: ticketPrioritySchema.default('medium'),
	source: ticketSourceSchema.default('manual'),
	tags: z.array(z.string()).default([]),
	assigneeId: z.uuid().optional()
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
	expectedVersion: z.number().int().positive(),
	resolution: ticketResolutionSchema.optional(),
	resolutionSummary: z.string().trim().max(2000).optional(),
	reason: z.string().trim().max(500).optional(),
	nextStep: z.string().trim().max(500).optional(),
	nextStepDue: z.date().optional(),
	nextStepOwnerId: ownerIdSchema
});

/**
 * Input for marking a ticket's attention as handled.
 */
export const markAttentionHandledSchema = z.object({
	ticketId: z.uuid(),
	expectedVersion: z.number().int().positive()
});

/**
 * Input for changing a ticket's assignee and next-step owner.
 */
export const assignTicketSchema = z.object({
	ticketId: z.uuid(),
	expectedVersion: z.number().int().positive(),
	assigneeId: ownerIdSchema,
	nextStepOwnerId: ownerIdSchema
});
