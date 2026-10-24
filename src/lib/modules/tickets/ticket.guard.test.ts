import { expect, test } from 'vitest';

import { checkStatusChange } from './ticket.guard';

const codes = (issues: { code: string }[]) => issues.map((issue) => issue.code);

test('an invalid transition is blocked and nothing else is checked', () => {
	const result = checkStatusChange(
		{ status: 'closed', reopenCount: 0 },
		{ to: 'in_progress', actorType: 'user' }
	);

	expect(codes(result.blockers)).toEqual(['invalid_transition']);
	expect(result.warnings).toEqual([]);
});

test('resolving without a summary is blocked', () => {
	const result = checkStatusChange(
		{ status: 'in_progress', reopenCount: 0 },
		{ to: 'resolved', resolution: 'solved', actorType: 'user' }
	);

	expect(codes(result.blockers)).toEqual(['resolution_required']);
});

test('resolving with resolution and summary passes', () => {
	const result = checkStatusChange(
		{ status: 'in_progress', reopenCount: 0 },
		{
			to: 'resolved',
			resolution: 'solved',
			resolutionSummary: 'Replaced the fuse.',
			actorType: 'user'
		}
	);

	expect(result).toEqual({ blockers: [], warnings: [] });
});

test('closing an open ticket without a summary passes with a warning', () => {
	const result = checkStatusChange(
		{ status: 'in_progress', reopenCount: 0 },
		{ to: 'closed', resolution: 'duplicate', actorType: 'user' }
	);

	expect(result.blockers).toEqual([]);
	expect(codes(result.warnings)).toEqual(['closing_without_summary']);
});

test('closing a resolved ticket needs nothing and warns about nothing', () => {
	const result = checkStatusChange(
		{ status: 'resolved', reopenCount: 0 },
		{ to: 'closed', actorType: 'user' }
	);

	expect(result).toEqual({ blockers: [], warnings: [] });
});

test('the first reopen gives no warning', () => {
	const result = checkStatusChange(
		{ status: 'resolved', reopenCount: 0 },
		{ to: 'in_progress', nextStep: 'Check the fix on site.', actorType: 'user' }
	);

	expect(result).toEqual({ blockers: [], warnings: [] });
});

test('a repeated reopen gives a warning', () => {
	const result = checkStatusChange(
		{ status: 'resolved', reopenCount: 2 },
		{ to: 'in_progress', nextStep: 'Check the fix on site.', actorType: 'user' }
	);

	expect(result.blockers).toEqual([]);
	expect(codes(result.warnings)).toEqual(['repeated_reopen']);
	expect(result.warnings[0]?.message).toContain('2 time(s)');
});

test('in_progress without a next step is blocked', () => {
	const result = checkStatusChange(
		{ status: 'new', reopenCount: 0 },
		{ to: 'in_progress', actorType: 'user' }
	);

	expect(codes(result.blockers)).toEqual(['next_step_required']);
});

test('waiting_customer needs no next-step text', () => {
	const result = checkStatusChange(
		{ status: 'new', reopenCount: 0 },
		{ to: 'waiting_customer', actorType: 'user' }
	);

	expect(result.blockers).toEqual([]);
});

test('a due date in the past is blocked', () => {
	const now = new Date('2026-10-12T10:00:00Z');

	const result = checkStatusChange(
		{ status: 'new', reopenCount: 0 },
		{ to: 'waiting_customer', nextStepDue: new Date('2026-10-12T09:00:00Z'), actorType: 'user' },
		now
	);

	expect(codes(result.blockers)).toEqual(['next_step_due_in_past']);
});

test('the system cannot close a ticket', () => {
	const result = checkStatusChange(
		{ status: 'in_progress', reopenCount: 0 },
		{ to: 'closed', resolution: 'no_response', actorType: 'system' }
	);

	expect(codes(result.blockers)).toEqual(['human_required']);
});

test('an AI actor cannot close a ticket', () => {
	const result = checkStatusChange(
		{ status: 'in_progress', reopenCount: 0 },
		{ to: 'closed', resolution: 'no_response', resolutionSummary: 'No reply.', actorType: 'ai' }
	);

	expect(codes(result.blockers)).toEqual(['human_required']);
});

test('a person can close a ticket', () => {
	const result = checkStatusChange(
		{ status: 'in_progress', reopenCount: 0 },
		{ to: 'closed', resolution: 'no_response', resolutionSummary: 'No reply.', actorType: 'user' }
	);

	expect(result).toEqual({ blockers: [], warnings: [] });
});

test('the system cannot close a resolved ticket either', () => {
	const result = checkStatusChange(
		{ status: 'resolved', reopenCount: 0 },
		{ to: 'closed', actorType: 'system' }
	);

	expect(codes(result.blockers)).toEqual(['human_required']);
});

test('human_required is reported before resolution_required', () => {
	const result = checkStatusChange(
		{ status: 'in_progress', reopenCount: 0 },
		{ to: 'closed', actorType: 'system' }
	);

	expect(codes(result.blockers)).toEqual(['human_required', 'resolution_required']);
});
