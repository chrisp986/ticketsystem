import { describe, expect, test } from 'vitest';

import {
	newlyAssignedUserIds,
	ownershipAfterStatusChange,
	resolveAssignment
} from './ticket.ownership';

const anna = 'anna';
const ben = 'ben';
const carla = 'carla';

describe('resolveAssignment', () => {
	test('assigning an unassigned ticket makes the assignee the next-step owner', () => {
		expect(
			resolveAssignment({ assigneeId: null, nextStepOwnerId: null }, { assigneeId: anna })
		).toEqual({ assigneeId: anna, nextStepOwnerId: anna });
	});

	test('the owner follows a reassignment when it was the previous assignee', () => {
		expect(
			resolveAssignment({ assigneeId: anna, nextStepOwnerId: anna }, { assigneeId: ben })
		).toEqual({ assigneeId: ben, nextStepOwnerId: ben });
	});

	test('an owner set to a colleague stays on reassignment', () => {
		expect(
			resolveAssignment({ assigneeId: anna, nextStepOwnerId: carla }, { assigneeId: ben })
		).toEqual({ assigneeId: ben, nextStepOwnerId: carla });
	});

	test('an owner changed in the same request wins', () => {
		expect(
			resolveAssignment(
				{ assigneeId: anna, nextStepOwnerId: anna },
				{ assigneeId: ben, nextStepOwnerId: carla }
			)
		).toEqual({ assigneeId: ben, nextStepOwnerId: carla });
	});

	test('resubmitting the current owner counts as unchanged, so it still follows', () => {
		expect(
			resolveAssignment(
				{ assigneeId: anna, nextStepOwnerId: anna },
				{ assigneeId: ben, nextStepOwnerId: anna }
			)
		).toEqual({ assigneeId: ben, nextStepOwnerId: ben });
	});

	test('unassigning clears an owner who was the assignee', () => {
		expect(
			resolveAssignment({ assigneeId: anna, nextStepOwnerId: anna }, { assigneeId: null })
		).toEqual({ assigneeId: null, nextStepOwnerId: null });
	});

	test('an empty owner does not fill up when the assignee stays', () => {
		expect(
			resolveAssignment(
				{ assigneeId: anna, nextStepOwnerId: null },
				{ assigneeId: anna, nextStepOwnerId: null }
			)
		).toEqual({ assigneeId: anna, nextStepOwnerId: null });
	});

	test('only the owner can be changed', () => {
		expect(
			resolveAssignment({ assigneeId: anna, nextStepOwnerId: anna }, { nextStepOwnerId: carla })
		).toEqual({ assigneeId: anna, nextStepOwnerId: carla });
	});
});

describe('ownershipAfterStatusChange', () => {
	const user = { type: 'user', id: anna } as const;

	test('a person moving an unassigned ticket out of new takes it', () => {
		expect(
			ownershipAfterStatusChange(
				{ assigneeId: null, nextStepOwnerId: null },
				{ from: 'new', to: 'in_progress' },
				user
			)
		).toEqual({ assigneeId: anna, nextStepOwnerId: anna });
	});

	test('an assigned ticket keeps its assignee', () => {
		expect(
			ownershipAfterStatusChange(
				{ assigneeId: ben, nextStepOwnerId: ben },
				{ from: 'new', to: 'in_progress' },
				user
			)
		).toEqual({ assigneeId: ben, nextStepOwnerId: ben });
	});

	test('the system never takes a ticket', () => {
		expect(
			ownershipAfterStatusChange(
				{ assigneeId: null, nextStepOwnerId: null },
				{ from: 'new', to: 'in_progress' },
				{ type: 'system' }
			)
		).toEqual({ assigneeId: null, nextStepOwnerId: null });
	});

	test('an unassigned ticket outside new stays unassigned', () => {
		expect(
			ownershipAfterStatusChange(
				{ assigneeId: null, nextStepOwnerId: null },
				{ from: 'in_progress', to: 'waiting_customer' },
				user
			)
		).toEqual({ assigneeId: null, nextStepOwnerId: null });
	});

	test('the chosen owner takes the new next step', () => {
		expect(
			ownershipAfterStatusChange(
				{ assigneeId: anna, nextStepOwnerId: anna },
				{ from: 'in_progress', to: 'waiting_internal', nextStepOwnerId: carla },
				user
			)
		).toEqual({ assigneeId: anna, nextStepOwnerId: carla });
	});

	test('the new next step defaults to the assignee', () => {
		expect(
			ownershipAfterStatusChange(
				{ assigneeId: anna, nextStepOwnerId: carla },
				{ from: 'waiting_internal', to: 'in_progress' },
				user
			)
		).toEqual({ assigneeId: anna, nextStepOwnerId: anna });
	});

	test('closing clears the owner and keeps the assignee', () => {
		expect(
			ownershipAfterStatusChange(
				{ assigneeId: anna, nextStepOwnerId: anna },
				{ from: 'resolved', to: 'closed', nextStepOwnerId: carla },
				user
			)
		).toEqual({ assigneeId: anna, nextStepOwnerId: null });
	});
});

describe('newlyAssignedUserIds', () => {
	test('lists only users who receive a field', () => {
		expect(
			newlyAssignedUserIds(
				{ assigneeId: anna, nextStepOwnerId: anna },
				{ assigneeId: anna, nextStepOwnerId: ben }
			)
		).toEqual([ben]);
	});

	test('lists a user once for both fields', () => {
		expect(
			newlyAssignedUserIds(
				{ assigneeId: null, nextStepOwnerId: null },
				{ assigneeId: ben, nextStepOwnerId: ben }
			)
		).toEqual([ben]);
	});

	test('clearing a field assigns nobody', () => {
		expect(
			newlyAssignedUserIds(
				{ assigneeId: anna, nextStepOwnerId: anna },
				{ assigneeId: null, nextStepOwnerId: null }
			)
		).toEqual([]);
	});
});
