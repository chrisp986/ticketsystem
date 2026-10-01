import { DrizzleQueryError } from 'drizzle-orm';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogContext = Record<string, unknown>;

const levelOrder: Record<LogLevel, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40
};

const MAX_CAUSE_DEPTH = 5;

function isLogLevel(value: string | undefined): value is LogLevel {
	return value !== undefined && Object.hasOwn(levelOrder, value);
}

function getMinLevel(): LogLevel {
	const configured = process.env.LOG_LEVEL;
	return isLogLevel(configured) ? configured : 'info';
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
	if (levelOrder[level] < levelOrder[getMinLevel()]) {
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
