import { expect, test } from 'vitest';

import { addBusinessMinutes } from './business-time';

test.each([
	['within the same day', '2026-10-09T10:00:00+02:00', 60, '2026-10-09T09:00:00.000Z'],
	['up to closing time', '2026-10-09T16:00:00+02:00', 60, '2026-10-09T15:00:00.000Z'],
	['across the weekend', '2026-10-09T16:30:00+02:00', 120, '2026-10-12T07:30:00.000Z'],
	['starting on a Saturday', '2026-10-10T12:00:00+02:00', 60, '2026-10-12T07:00:00.000Z'],
	['starting before opening', '2026-10-09T06:00:00+02:00', 60, '2026-10-09T07:00:00.000Z'],
	['one working day', '2026-10-09T10:00:00+02:00', 540, '2026-10-12T08:00:00.000Z'],
	['across the switch to winter time', '2026-10-23T16:00:00+02:00', 120, '2026-10-26T08:00:00.000Z']
])('%s', (_name, start, minutes, expected) => {
	expect(addBusinessMinutes(new Date(start), minutes).toISOString()).toBe(expected);
});
