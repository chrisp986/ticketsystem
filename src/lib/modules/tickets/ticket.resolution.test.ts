import { expect, test } from 'vitest';

import { isResolutionValid } from './ticket.resolution';

test.each([
	['resolved', 'solved', 'Replaced the fuse.', true],
	['resolved', 'workaround', 'Use the second charger.', true],
	['resolved', 'solved', undefined, false],
	['resolved', 'solved', '   ', false],
	['resolved', undefined, 'Replaced the fuse.', false],
	['resolved', 'duplicate', 'Same as another ticket.', false],
	['closed', 'duplicate', undefined, true],
	['closed', 'no_response', 'No answer after two reminders.', true],
	['closed', undefined, undefined, false],
	['closed', 'solved', 'Replaced the fuse.', false],
	['in_progress', undefined, undefined, true],
	['waiting_customer', undefined, undefined, true]
] as const)('to %s with %s and summary %j is %s', (to, resolution, summary, expected) => {
	expect(isResolutionValid(to, resolution, summary)).toBe(expected);
});
