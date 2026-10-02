import { DrizzleQueryError } from 'drizzle-orm';

export const logLevels = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof logLevels)[number];

type LogContext = Record<string, unknown>;

const levelOrder: Record<LogLevel, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40
};

const MAX_CAUSE_DEPTH = 5;

let minLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
	minLevel = level;
}

// Drizzle puts the query parameters (user content) into message and stack.
function safeMessageAndStack(error: Error): { message: string; stack?: string } {
	if (!(error instanceof DrizzleQueryError)) {
		return { message: error.message, stack: error.stack };
	}

	const message = `Failed query: ${error.query}`;
	return { message, stack: error.stack?.replace(error.message, message) };
}

export function serializeError(error: unknown, depth = 0): unknown {
	if (!(error instanceof Error)) {
		return error;
	}

	const { message, stack } = safeMessageAndStack(error);

	return {
		...primitiveFields(error),
		name: error.name,
		message,
		stack,
		cause:
			depth < MAX_CAUSE_DEPTH && error.cause !== undefined
				? serializeError(error.cause, depth + 1)
				: undefined
	};
}

function write(level: LogLevel, message: string, context: LogContext = {}): void {
	if (levelOrder[level] < levelOrder[minLevel]) {
		return;
	}

	const serializedContext = Object.fromEntries(
		Object.entries(context).map(([key, value]) => [key, serializeError(value)])
	);

	let line: string;

	try {
		line = JSON.stringify({
			...serializedContext,
			level,
			time: new Date().toISOString(),
			message
		});
	} catch {
		line = JSON.stringify({
			level,
			time: new Date().toISOString(),
			message,
			logError: 'Log context could not be serialized.'
		});
	}

	if (level === 'warn' || level === 'error') {
		console.error(line);
	} else {
		console.log(line);
	}
}

export const logger = {
	debug: (message: string, context?: LogContext) => write('debug', message, context),
	info: (message: string, context?: LogContext) => write('info', message, context),
	warn: (message: string, context?: LogContext) => write('warn', message, context),
	error: (message: string, context?: LogContext) => write('error', message, context)
};

const primitiveTypes = new Set(['string', 'number', 'boolean']);

function primitiveFields(error: Error): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(error).filter(([, value]) => value === null || primitiveTypes.has(typeof value))
	);
}
