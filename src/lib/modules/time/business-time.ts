import { TZDate } from '@date-fns/tz';

/**
 * Business hours used for due dates (ADR 0006).
 *
 * Public holidays and extended hours are not modelled yet.
 */
export const businessHours = {
	timeZone: 'Europe/Berlin',
	startHour: 8,
	endHour: 17
} as const;

export const minutesPerWorkingDay = (businessHours.endHour - businessHours.startHour) * 60;

function isWorkingDay(date: TZDate): boolean {
	const day = date.getDay();
	return day >= 1 && day <= 5;
}

/**
 * Returns the given moment if it is within business hours,
 * otherwise the start of the next working period.
 */
function startOfNextWorkingPeriod(date: Date): TZDate {
	const current = new TZDate(date.getTime(), businessHours.timeZone);

	for (;;) {
		if (!isWorkingDay(current)) {
			current.setDate(current.getDate() + 1);
			current.setHours(businessHours.startHour, 0, 0, 0);
			continue;
		}

		const minutes = current.getHours() * 60 + current.getMinutes();

		if (minutes < businessHours.startHour * 60) {
			current.setHours(businessHours.startHour, 0, 0, 0);
			return current;
		}

		if (minutes >= businessHours.endHour * 60) {
			current.setDate(current.getDate() + 1);
			current.setHours(businessHours.startHour, 0, 0, 0);
			continue;
		}

		return current;
	}
}

/**
 * Adds minutes that only count during business hours.
 */
export function addBusinessMinutes(start: Date, minutes: number): Date {
	let current = startOfNextWorkingPeriod(start);
	let remaining = minutes;

	for (;;) {
		const endOfDay = new TZDate(current.getTime(), businessHours.timeZone);
		endOfDay.setHours(businessHours.endHour, 0, 0, 0);

		const available = (endOfDay.getTime() - current.getTime()) / 60_000;

		if (remaining <= available) {
			return new Date(current.getTime() + remaining * 60_000);
		}

		remaining -= available;
		current = startOfNextWorkingPeriod(endOfDay);
	}
}
