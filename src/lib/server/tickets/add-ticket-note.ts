import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { z } from 'zod';

import type { Actor } from '../../modules/tickets/ticket.types';
import type {
	addTicketNoteSchema,
	ticketNoteSchema
} from '../../modules/tickets/ticket.validation';
import { ticketNotes } from '../db/schema/ticket-notes';
import { tickets } from '../db/schema/tickets';

type AddTicketNoteInput = z.infer<typeof addTicketNoteSchema>;
type TicketNote = z.infer<typeof ticketNoteSchema>;

type Queryable = Pick<NodePgDatabase, 'insert'>;

/**
 * Writes a note. Only people write notes (ADR 0005), so any other actor is a programming error.
 */
export async function insertTicketNote(
	database: Queryable,
	ticketId: string,
	note: TicketNote,
	actor: Actor,
	createdAt: Date
): Promise<void> {
	if (actor.type !== 'user') {
		throw new Error(`Only users write ticket notes, not ${actor.type} actors.`);
	}

	await database.insert(ticketNotes).values({
		ticketId,
		kind: note.kind,
		body: note.body,
		authorId: actor.id,
		createdAt
	});
}

/**
 * Adds a note to a ticket, closed tickets included. The ticket itself does not change (ADR 0005).
 */
export async function addTicketNote(
	database: NodePgDatabase,
	input: AddTicketNoteInput,
	actor: Actor,
	now: Date = new Date()
): Promise<'added' | 'not_found'> {
	const { ticketId, ...note } = input;

	const [ticket] = await database
		.select({ id: tickets.id })
		.from(tickets)
		.where(eq(tickets.id, ticketId))
		.limit(1);

	if (!ticket) {
		return 'not_found';
	}

	await insertTicketNote(database, ticketId, note, actor, now);

	return 'added';
}
