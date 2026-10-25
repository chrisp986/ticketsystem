import type { Actor, ActorType } from '../../modules/tickets/ticket.types';

export type ActorFields = {
	actorType: ActorType;
	actorId: string | null;
	actorName: string | null;
};

/**
 * The actor columns of a history row (ADR 0009).
 */
export function actorFields(actor: Actor): ActorFields {
	return actor.type === 'user'
		? { actorType: 'user', actorId: actor.id, actorName: null }
		: { actorType: actor.type, actorId: null, actorName: actor.name };
}

/**
 * The actor stored in a history row. The database guarantees that the matching column is set.
 */
export function actorFromFields(fields: ActorFields): Actor {
	if (fields.actorType === 'user') {
		return { type: 'user', id: fields.actorId! };
	}

	return { type: fields.actorType, name: fields.actorName! };
}
