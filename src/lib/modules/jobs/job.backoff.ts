const BASE_DELAY_MS = 60 * 1000;
const GROWTH_FACTOR = 5;
const MAX_DELAY_MS = 2 * 60 * 60 * 1000;

/**
 * How long a job waits after a failed attempt: 1 minute, 5 minutes, 25 minutes, then 2 hours
 * at most (ADR 0011).
 */
export function jobRetryDelayMs(attemptNumber: number): number {
	return Math.min(BASE_DELAY_MS * GROWTH_FACTOR ** (attemptNumber - 1), MAX_DELAY_MS);
}
