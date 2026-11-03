import { z } from 'zod';

import {
	EMAIL_ATTACHMENT_MAX_SIZE_BYTES,
	EMAIL_MESSAGE_ID_MAX_LENGTH,
	EMAIL_PROVIDER_ID_MAX_LENGTH,
	EMAIL_PROVIDER_MAX_LENGTH
} from './email.constants';

/**
 * Postgres cannot store NUL characters in text, and real emails can contain them.
 */
function withoutNul(value: string): string {
	return value.replaceAll('\0', '');
}

const storableText = z.string().transform(withoutNul);

const optionalText = storableText.nullable().default(null);

/**
 * A Message-ID without its angle brackets, or null when it is unusable. An unusable one must
 * not reject the email: it comes from the sender, and the email would be lost (ADR 0012).
 */
function normalizeMessageId(value: string | null): string | null {
	if (value === null) {
		return null;
	}

	const id = withoutNul(value).trim().replace(/^<|>$/g, '').trim();

	return id.length > 0 && id.length <= EMAIL_MESSAGE_ID_MAX_LENGTH ? id : null;
}

const messageId = z.string().nullable().default(null).transform(normalizeMessageId);

const providerText = (maxLength: number) =>
	storableText.pipe(z.string().trim().min(1).max(maxLength));

const address = storableText.pipe(z.string().trim().toLowerCase());

const emailAddressSchema = z.object({
	address,
	name: optionalText
});

export const emailAttachmentSchema = z.object({
	fileName: optionalText,
	contentType: optionalText,
	sizeBytes: z.number().int().nonnegative().max(EMAIL_ATTACHMENT_MAX_SIZE_BYTES),
	providerAttachmentId: providerText(EMAIL_PROVIDER_ID_MAX_LENGTH)
});

/**
 * A received email as a provider adapter hands it over (ADR 0012). The provider and mailbox are
 * ours, so bad values are errors; what the sender controls is accepted and cleaned.
 */
export const storeEmailSchema = z.object({
	provider: providerText(EMAIL_PROVIDER_MAX_LENGTH),
	providerMessageId: providerText(EMAIL_PROVIDER_ID_MAX_LENGTH),
	mailbox: providerText(EMAIL_PROVIDER_ID_MAX_LENGTH),
	messageId,
	inReplyTo: messageId,
	references: z
		.array(z.string())
		.default([])
		.transform((ids) => ids.map(normalizeMessageId).filter((id) => id !== null)),
	fromAddress: address.nullable().default(null),
	fromName: optionalText,
	toAddresses: z.array(emailAddressSchema).default([]),
	ccAddresses: z.array(emailAddressSchema).default([]),
	subject: optionalText,
	textBody: optionalText,
	htmlBody: optionalText,
	sentAt: z.date().nullable().default(null),
	receivedAt: z.date(),
	attachments: z.array(emailAttachmentSchema).default([])
});

export type StoreEmailInput = z.input<typeof storeEmailSchema>;

export type EmailAddress = z.infer<typeof emailAddressSchema>;
