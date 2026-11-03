/**
 * Lists and parses the latest inbox messages without saving anything (ADR 0013).
 *
 * Usage: pnpm gmail:check [--limit 5]
 * Prints only counts and lengths, never addresses, subjects or content.
 */
import 'dotenv/config';

import { parseArgs } from 'node:util';

import { storeEmailSchema } from '../src/lib/modules/emails/email.validation';
import { parseGmailConfig } from '../src/lib/server/config';
import { createGmailProvider } from '../src/lib/server/emails/gmail/gmail-provider';

async function main() {
	const { values } = parseArgs({ options: { limit: { type: 'string', default: '5' } } });
	const limit = Number(values.limit);

	if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
		throw new Error('Usage: pnpm gmail:check [--limit 1-50]');
	}

	const config = parseGmailConfig(process.env);
	const provider = createGmailProvider({
		clientId: config.GMAIL_CLIENT_ID,
		clientSecret: config.GMAIL_CLIENT_SECRET,
		refreshToken: config.GMAIL_REFRESH_TOKEN,
		mailbox: config.GMAIL_MAILBOX,
		recentLimit: limit
	});

	const changes = await provider.listChanges(null);
	console.log(
		`Signed in. ${changes.providerMessageIds.length} recent inbox messages, position ${changes.cursor}.`
	);

	const rows = [];

	for (const id of changes.providerMessageIds) {
		const message = await provider.fetchMessage(id);

		if (!message) {
			rows.push({ found: false });
			continue;
		}

		const parsed = storeEmailSchema.safeParse(message);

		rows.push({
			found: true,
			valid: parsed.success,
			messageId: Boolean(parsed.success && parsed.data.messageId),
			from: Boolean(parsed.success && parsed.data.fromAddress),
			textChars: parsed.success ? (parsed.data.textBody?.length ?? 0) : 0,
			htmlChars: parsed.success ? (parsed.data.htmlBody?.length ?? 0) : 0,
			attachments: parsed.success ? parsed.data.attachments.length : 0,
			received: message.receivedAt.toISOString()
		});
	}

	console.table(rows);
}

main().catch((err: unknown) => {
	console.error(err instanceof Error ? `${err.name}: ${err.message}` : err);
	process.exitCode = 1;
});
