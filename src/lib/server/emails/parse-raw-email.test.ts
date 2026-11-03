import { readFile } from 'node:fs/promises';

import { describe, expect, test } from 'vitest';

import { storeEmailSchema } from '../../modules/emails/email.validation';
import { parseRawEmail } from './parse-raw-email';

const source = {
	provider: 'test-provider',
	providerMessageId: 'provider-1',
	mailbox: 'support@example.com',
	receivedAt: new Date('2026-11-02T12:00:00.000Z')
};

async function parseFixture(name: string) {
	const raw = await readFile(new URL(`./fixtures/${name}`, import.meta.url));
	return parseRawEmail(raw, source);
}

describe('parseRawEmail', () => {
	test('reads a plain text email with its threading headers', async () => {
		expect(await parseFixture('plain.eml')).toMatchObject({
			...source,
			messageId: '<plain-1@example.com>',
			inReplyTo: '<earlier@example.com>',
			references: ['<first@example.com>', '<earlier@example.com>'],
			fromAddress: 'Jo@Example.com',
			fromName: 'Jo Customer',
			toAddresses: [
				{ address: 'support@example.com', name: 'Support' },
				{ address: 'other@example.com', name: null }
			],
			ccAddresses: [
				{ address: 'a@example.com', name: null },
				{ address: 'b@example.com', name: null }
			],
			subject: 'Printer broken',
			// Bodies are kept as received, line breaks included.
			textBody: 'The printer stopped working.\n',
			htmlBody: null,
			sentAt: new Date('2026-11-02T08:30:00.000Z'),
			attachments: []
		});
	});

	test('decodes an encoded subject and a legacy character set, and derives the text', async () => {
		const parsed = await parseFixture('html-only.eml');

		expect(parsed.subject).toBe('Bestellung über 100 €');
		expect(parsed.htmlBody).toContain('Grüße, <b>Ihr Shop</b>');
		expect(parsed.textBody?.trim()).toBe('Grüße, Ihr Shop');
	});

	test('lists attachments and inline images with stable, distinct IDs', async () => {
		const parsed = await parseFixture('multipart.eml');
		const again = await parseFixture('multipart.eml');

		expect(parsed.textBody).toBe('See the photo.');
		expect(parsed.htmlBody).toContain('cid:logo@example.com');
		expect(parsed.attachments).toMatchObject([
			{ fileName: 'logo.png', contentType: 'image/png', sizeBytes: 5 },
			{ fileName: 'report.pdf', contentType: 'application/pdf', sizeBytes: 15 },
			{ fileName: 'report.pdf', contentType: 'application/pdf', sizeBytes: 15 }
		]);

		const ids = (parsed.attachments ?? []).map((attachment) => attachment.providerAttachmentId);

		expect(new Set(ids).size).toBe(3);
		expect(ids).toEqual((again.attachments ?? []).map((a) => a.providerAttachmentId));
	});

	test('accepts a malformed email instead of losing it', async () => {
		const parsed = await parseFixture('malformed.eml');

		expect(parsed).toMatchObject({
			messageId: null,
			fromAddress: null,
			toAddresses: [],
			sentAt: null,
			textBody: 'No headers worth having.\n'
		});
		expect(storeEmailSchema.safeParse(parsed).success).toBe(true);
	});

	test('reads a Date header without a weekday or with a zone name', async () => {
		const raw = (date: string) => Buffer.from(`Date: ${date}\r\nSubject: x\r\n\r\nx\r\n`);

		expect((await parseRawEmail(raw('2 Nov 2026 09:30:00 +0100'), source)).sentAt).toEqual(
			new Date('2026-11-02T08:30:00.000Z')
		);
		expect((await parseRawEmail(raw('Mon, 02 Nov 2026 08:30:00 GMT'), source)).sentAt).toEqual(
			new Date('2026-11-02T08:30:00.000Z')
		);
	});

	test.each(['plain.eml', 'html-only.eml', 'multipart.eml'])(
		'produces valid input for storing (%s)',
		async (name) => {
			expect(storeEmailSchema.safeParse(await parseFixture(name)).success).toBe(true);
		}
	);
});
