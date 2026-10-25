import { error } from '@sveltejs/kit';

import type { Actor } from '$lib/modules/tickets/ticket.types';

import type { SessionUser } from './session';

/**
 * The signed-in user as the actor of a change.
 *
 * Every ticket route requires sign-in (ADR 0007), so a missing user is a bug.
 */
export function userActor(user: SessionUser | null): Actor & { id: string } {
	if (!user) {
		error(401, 'Please sign in.');
	}

	return { type: 'user', id: user.id };
}
