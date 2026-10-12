import { TZDate } from '@date-fns/tz';

import { businessHours } from './business-time';

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Formats a moment as a datetime-local value in business time zone.
 */
export function toLocalInputValue(date: Date): string {
	const local = new TZDate(date.getTime(), businessHours.timeZone);

	return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
}

/**
 * Reads a datetime-local value as business time zone. Returns null if invalid.
 */
export function fromLocalInputValue(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);

	if (!match) {
		return null;
	}

	const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
		number,
		number,
		number,
		number,
		number
	];

	const local = new TZDate(year, month - 1, day, hour, minute, businessHours.timeZone);

	return new Date(local.getTime());
}
