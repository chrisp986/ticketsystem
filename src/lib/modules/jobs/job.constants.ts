/**
 * Queues with their own concurrency, so slow AI jobs never block other work (ADR 0003).
 */
export const jobQueues = ['default', 'ai'] as const;

/**
 * A job's life (ADR 0011).
 */
export const jobStatuses = ['queued', 'running', 'succeeded', 'dead'] as const;

/**
 * How one try of a job ended. `lost` means its worker's lock expired (ADR 0011).
 */
export const jobAttemptOutcomes = ['succeeded', 'failed', 'lost'] as const;

export const DEFAULT_MAX_JOB_ATTEMPTS = 5;

export const JOB_DEDUPE_KEY_MAX_LENGTH = 200;
