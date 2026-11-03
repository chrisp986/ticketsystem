import type { StoreEmailInput } from '../../modules/emails/email.validation';

/**
 * The messages that arrived since a saved position, and the position to save next (ADR 0013).
 */
export type EmailChanges = {
	providerMessageIds: string[];
	cursor: string;
	/** True when the saved position was unusable and recent messages were listed instead. */
	fullResync: boolean;
};

/**
 * A mailbox at an email provider. The sync job (step 4.3) only uses this interface.
 */
export type EmailProvider = {
	readonly provider: string;
	readonly mailbox: string;
	/** Lists new messages since `cursor`, or recent messages when it is null. */
	listChanges(cursor: string | null): Promise<EmailChanges>;
	/** Fetches one message, or returns null when it no longer exists. */
	fetchMessage(providerMessageId: string): Promise<StoreEmailInput | null>;
};

/**
 * A failure that may pass, such as a rate limit or a server error. Retrying is worthwhile.
 */
export class EmailProviderTemporaryError extends Error {
	override name = 'EmailProviderTemporaryError';
}

/**
 * The provider refused our credentials. An operator must sign in again; retrying cannot help.
 */
export class EmailProviderAuthError extends Error {
	override name = 'EmailProviderAuthError';
}
