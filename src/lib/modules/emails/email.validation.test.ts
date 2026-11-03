import { describe, expect, test } from 'vitest';

import { storeEmailSchema } from './email.validation';

const email = {
	provider: 'gmail',
	providerMessageId: 'provider-1',
	mailbox: 'support@example.com',
	receivedAt: new Date('2026-11-01T10:00:00.000Z')
};

describe('storeEmailSchema', () => {
	test('fills in what an email does not have', () => {
		expect(storeEmailSchema.parse(email)).toMatchObject({
			messageId: null,
			inReplyTo: null,
			references: [],
			fromAddress: null,
			toAddresses: [],
			subject: null,
			textBody: null,
			htmlBody: null,
			sentAt: null,
			attachments: []
		});
	});

	test('removes the angle brackets of Message-IDs', () => {
		expect(
			storeEmailSchema.parse({
				...email,
				messageId: ' <a@example.com> ',
				inReplyTo: '<b@example.com>',
				references: ['<c@example.com>', '<d@example.com>']
			})
		).toMatchObject({
			messageId: 'a@example.com',
			inReplyTo: 'b@example.com',
			references: ['c@example.com', 'd@example.com']
		});
	});

	test.each([
		['blank', '   '],
		['empty brackets', '<>'],
		['too long', `<${'x'.repeat(501)}@example.com>`]
	])('treats a %s Message-ID as missing instead of rejecting the email', (_name, messageId) => {
		const parsed = storeEmailSchema.parse({
			...email,
			messageId,
			references: [messageId, '<a@b>']
		});

		expect(parsed.messageId).toBeNull();
		expect(parsed.references).toEqual(['a@b']);
	});

	test('strips NUL characters from everything the sender controls', () => {
		const parsed = storeEmailSchema.parse({
			...email,
			messageId: 'a\0@example.com',
			fromAddress: 'Jo\0@Example.com',
			fromName: 'J\0o',
			toAddresses: [{ address: 'a\0@example.com', name: 'A\0' }],
			subject: 'Sub\0ject',
			textBody: 'Bo\0dy',
			htmlBody: '<p>\0</p>',
			attachments: [
				{
					fileName: 'a\0.pdf',
					contentType: 'application\0/pdf',
					sizeBytes: 1,
					providerAttachmentId: 'x'
				}
			]
		});

		expect(JSON.stringify(parsed)).not.toContain('\\u0000');
	});

	test('lowercases addresses for matching', () => {
		expect(
			storeEmailSchema.parse({
				...email,
				fromAddress: ' Jo@Example.COM ',
				ccAddresses: [{ address: 'CC@Example.com' }]
			})
		).toMatchObject({
			fromAddress: 'jo@example.com',
			ccAddresses: [{ address: 'cc@example.com', name: null }]
		});
	});

	test.each([
		['a blank provider', { provider: ' ' }],
		['a blank provider message ID', { providerMessageId: '' }],
		['a blank mailbox', { mailbox: '\0' }],
		['an invalid date', { receivedAt: new Date('nonsense') }],
		['a negative attachment size', { attachments: [{ sizeBytes: -1, providerAttachmentId: 'x' }] }],
		['an attachment without an ID', { attachments: [{ sizeBytes: 1, providerAttachmentId: ' ' }] }]
	])('rejects %s', (_name, values) => {
		expect(storeEmailSchema.safeParse({ ...email, ...values }).success).toBe(false);
	});
});
