import { expect, test } from 'vitest';

import { checkStatusChange } from './ticket.guard';

const codes = (issues: { code: string }[]) => issues.map((issue) => issue.code);

test('an invalid transition is blocked and nothing else is checked', () => {
	const result = checkStatusChange({ status: 'closed', reopenCount: 0 }, { to: 'in_progress' });

	expect(codes(result.blockers)).toEqual(['invalid_transition']);
	expect(result.warnings).toEqual([]);
});

test('resolving without a summary is blocked', () => {
	const result = checkStatusChange(
		{ status: 'in_progress', reopenCount: 0 },
		{ to: 'resolved', resolution: 'solved' }
	);

	expect(codes(result.blockers)).toEqual(['resolution_required']);
});

test('resolving with resolution and summary passes', () => {
	const result = checkStatusChange(
		{ status: 'in_progress', reopenCount: 0 },
		{ to: 'resolved', resolution: 'solved', resolutionSummary: 'Replaced the fuse.' }
	);

	expect(result).toEqual({ blockers: [], warnings: [] });
});

test('closing an open ticket without a summary passes with a warning', () => {
	const result = checkStatusChange(
		{ status: 'in_progress', reopenCount: 0 },
		{ to: 'closed', resolution: 'duplicate' }
	);

	expect(result.blockers).toEqual([]);
	expect(codes(result.warnings)).toEqual(['closing_without_summary']);
});

test('closing a resolved ticket needs nothing and warns about nothing', () => {
	const result = checkStatusChange({ status: 'resolved', reopenCount: 0 }, { to: 'closed' });

	expect(result).toEqual({ blockers: [], warnings: [] });
});

test('the first reopen gives no warning', () => {
	const result = checkStatusChange({ status: 'resolved', reopenCount: 0 }, { to: 'in_progress' });

	expect(result).toEqual({ blockers: [], warnings: [] });
});

test('a repeated reopen gives a warning', () => {
	const result = checkStatusChange({ status: 'resolved', reopenCount: 2 }, { to: 'in_progress' });

	expect(result.blockers).toEqual([]);
	expect(codes(result.warnings)).toEqual(['repeated_reopen']);
	expect(result.warnings[0]?.message).toContain('2 time(s)');
});
