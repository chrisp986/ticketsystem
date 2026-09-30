import { afterEach, expect, test, vi } from 'vitest';

import { logger, serializeError } from './logger';

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

test('serializes error message, stack and nested cause fields', () => {
	const pgError = Object.assign(new Error('violates check constraint'), {
		code: '23514',
		constraint: 'tickets_closed_at_matches_status'
	});
	const wrapped = new Error('Failed query', { cause: pgError });

	expect(serializeError(wrapped)).toMatchObject({
		name: 'Error',
		message: 'Failed query',
		cause: { code: '23514', constraint: 'tickets_closed_at_matches_status' }
	});
});

test('writes one JSON line with level, time, message and context', () => {
	const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

	logger.info('ticket created', { ticketId: 'abc' });

	expect(spy).toHaveBeenCalledOnce();
	expect(JSON.parse(String(spy.mock.calls[0]?.[0]))).toMatchObject({
		level: 'info',
		message: 'ticket created',
		ticketId: 'abc'
	});
});

test('context cannot overwrite the level field', () => {
	const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

	logger.info('hello', { level: 'fake' });

	expect(JSON.parse(String(spy.mock.calls[0]?.[0])).level).toBe('info');
});

test('skips messages below the configured level', () => {
	vi.stubEnv('LOG_LEVEL', 'warn');
	const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

	logger.info('ignored');

	expect(spy).not.toHaveBeenCalled();
});
