import { simpleParser } from 'mailparser';
import type { AddressObject, EmailAddress as ParsedAddress } from 'mailparser';

import type { EmailAddress, StoreEmailInput } from '../../modules/emails/email.validation';

type MessageSource = {
	provider: string;
	providerMessageId: string;
	mailbox: string;
	receivedAt: Date;
};

function flatten(addresses: ParsedAddress[]): ParsedAddress[] {
	return addresses.flatMap((entry) => (entry.group ? flatten(entry.group) : [entry]));
}

function addressList(field: AddressObject | AddressObject[] | undefined): EmailAddress[] {
	const objects = field === undefined ? [] : Array.isArray(field) ? field : [field];

	return flatten(objects.flatMap((object) => object.value)).flatMap((entry) =>
		entry.address ? [{ address: entry.address, name: entry.name || null }] : []
	);
}

/**
 * The Date header, or null when it is missing or invalid. Read from the raw header line, because
 * the parser puts the current time in place of a missing or invalid date.
 */
function sentAt(headerLines: readonly { key: string; line: string }[]): Date | null {
	const line = headerLines.find((header) => header.key === 'date')?.line;
	const value = line?.slice(line.indexOf(':') + 1).trim();
	const date = value ? new Date(value) : null;

	return date && !Number.isNaN(date.getTime()) ? date : null;
}

/**
 * Turns a raw MIME message into what `storeEmail` stores. Works for any provider that hands
 * out raw messages (ADR 0013).
 *
 * An attachment's ID is its position in the message plus a checksum of its content: the raw
 * message never changes, so the attachment can always be found again.
 */
export async function parseRawEmail(raw: Buffer, source: MessageSource): Promise<StoreEmailInput> {
	const parsed = await simpleParser(raw, { skipImageLinks: true, skipTextLinks: true });
	const [from] = flatten(
		(parsed.from ? [parsed.from] : []).flatMap((object) => object.value)
	).filter((entry) => entry.address);
	const references = parsed.references ?? [];

	return {
		...source,
		messageId: parsed.messageId ?? null,
		inReplyTo: parsed.inReplyTo ?? null,
		references: Array.isArray(references) ? references : references.split(/\s+/),
		fromAddress: from?.address ?? null,
		fromName: from?.name || null,
		toAddresses: addressList(parsed.to),
		ccAddresses: addressList(parsed.cc),
		subject: parsed.subject ?? null,
		textBody: parsed.text ?? null,
		htmlBody: parsed.html || null,
		sentAt: sentAt(parsed.headerLines),
		attachments: parsed.attachments.map((attachment, index) => ({
			fileName: attachment.filename ?? null,
			contentType: attachment.contentType || null,
			sizeBytes: attachment.size,
			providerAttachmentId: `${index + 1}:${attachment.checksum}`
		}))
	};
}
