import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { storeEmailSchema } from '../../modules/emails/email.validation';
import type { StoreEmailInput } from '../../modules/emails/email.validation';
import { emailAttachments, emails } from '../db/schema/emails';
import type { EmailRecord } from '../db/schema/emails';

type Transactional = Pick<NodePgDatabase, 'transaction'>;

/**
 * Saves a received email with its attachment details, all or nothing. Pass a transaction to
 * save it together with other changes.
 *
 * Returns `duplicate`, and writes nothing, when the provider's ID or the Message-ID is already
 * stored (ADR 0012). Invalid provider fields are a programming error and throw.
 */
export async function storeEmail(
	database: Transactional,
	input: StoreEmailInput,
	now: Date = new Date()
): Promise<EmailRecord | 'duplicate'> {
	const { attachments, ...email } = storeEmailSchema.parse(input);

	return database.transaction(async (tx) => {
		const [stored] = await tx
			.insert(emails)
			.values({ ...email, direction: 'inbound', createdAt: now })
			// No target: either unique index makes it a duplicate.
			.onConflictDoNothing()
			.returning();

		if (!stored) {
			return 'duplicate';
		}

		if (attachments.length > 0) {
			await tx
				.insert(emailAttachments)
				.values(attachments.map((attachment) => ({ ...attachment, emailId: stored.id })));
		}

		return stored;
	});
}
