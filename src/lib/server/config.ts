import { z } from 'zod';

import { logLevels } from './logger';

const serverConfigSchema = z.object({
	DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
	LOG_LEVEL: z.enum(logLevels).default('info')
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

export function parseServerConfig(source: Record<string, string | undefined>): ServerConfig {
	const result = serverConfigSchema.safeParse(source);

	if (!result.success) {
		throw new Error(`Invalid server configuration:\n${z.prettifyError(result.error)}`);
	}

	return result.data;
}

const gmailConfigSchema = z.object({
	GMAIL_CLIENT_ID: z.string().trim().min(1),
	GMAIL_CLIENT_SECRET: z.string().trim().min(1),
	GMAIL_REFRESH_TOKEN: z.string().trim().min(1),
	GMAIL_MAILBOX: z.email()
});

export type GmailConfig = z.infer<typeof gmailConfigSchema>;

/**
 * Gmail settings, needed only by the worker and the Gmail scripts (ADR 0013).
 */
export function parseGmailConfig(source: Record<string, string | undefined>): GmailConfig {
	const result = gmailConfigSchema.safeParse(source);

	if (!result.success) {
		throw new Error(`Invalid Gmail configuration:\n${z.prettifyError(result.error)}`);
	}

	return result.data;
}
