import { expect, test } from 'vitest';

import { fromLocalInputValue, toLocalInputValue } from './local-datetime';

test('formats a moment as Berlin time', () => {
	expect(toLocalInputValue(new Date('2026-10-12T07:30:00Z'))).toBe('2026-10-12T09:30');
});

test('reads a form value as Berlin time', () => {
	expect(fromLocalInputValue('2026-10-12T09:30')?.toISOString()).toBe('2026-10-12T07:30:00.000Z');
	expect(fromLocalInputValue('2026-10-26T09:00')?.toISOString()).toBe('2026-10-26T08:00:00.000Z');
});

test('rejects anything else', () => {
	expect(fromLocalInputValue('tomorrow')).toBeNull();
});
