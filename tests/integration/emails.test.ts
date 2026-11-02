import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, test } from 'vitest';

import type { StoreEmailInput } from '../../src/lib/modules/emails/email.validation';
import { emailAttachments, emails } from '../../src/lib/server/db/schema/emails';
import { tickets } from '../../src/lib/server/db/schema/tickets';
import { storeEmail } from '../../src/lib/server/emails/store-email';
import { deleteTestTicket, testCreator, testDb, testPool } from './helpers/db';

const receivedAt = new Date('2026-11-01T10:00:00.000Z');
const now = new Date('2026-11-01T10:00:05.000Z');

let counter = 0;

function email(values: Partial<StoreEmailInput> = {}): StoreEmailInput {
	counter += 1;

	return {
		provider: 'test-provider',
		providerMessageId: `provider-${counter}`,
		mailbox: 'support@example.com',
		receivedAt,
		...values
	};
}

beforeEach(async () => {
	await testDb.delete(emails);
});

afterAll(async () => {
	await testDb.delete(emails);
	await testPool.end();
});

async function stored(input: StoreEmailInput = email()) {
	const record = await storeEmail(testDb, input, now);

	if (record === 'duplicate') {
		throw new Error('Test email was a duplicate.');
	}

	return record;
}

async function emailCount() {
	return (await testDb.select({ id: emails.id }).from(emails)).length;
}

async function attachmentsOf(emailId: string) {
	return testDb.select().from(emailAttachments).where(eq(emailAttachments.emailId, emailId));
}

async function insertTicket() {
	const [ticket] = await testDb
		.insert(tickets)
		.values({
			...testCreator,
			subject: 'Integration test: emails',
			status: 'in_progress',
			nextStep: 'Reply',
			nextStepDue: new Date('2030-01-01T00:00:00.000Z')
		})
		.returning();

	if (!ticket) {
		throw new Error('Test ticket was not created.');
	}

	return ticket;
}

const attachment = { fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 10 };

describe('storing an email', () => {
	test('saves all its fields and attachment details', async () => {
		const sentAt = new Date('2026-11-01T09:59:00.000Z');
		const record = await stored(
			email({
				messageId: '<a@example.com>',
				inReplyTo: '<b@example.com>',
				references: ['<c@example.com>', '<b@example.com>'],
				fromAddress: 'Jo@Example.com',
				fromName: 'Jo',
				toAddresses: [{ address: 'support@example.com', name: 'Support' }],
				ccAddresses: [{ address: 'cc@example.com' }],
				subject: 'Printer',
				textBody: 'It is broken.',
				htmlBody: '<p>It is broken.</p>',
				sentAt,
				attachments: [{ ...attachment, providerAttachmentId: 'file-1' }]
			})
		);

		expect(record).toMatchObject({
			ticketId: null,
			direction: 'inbound',
			provider: 'test-provider',
			mailbox: 'support@example.com',
			messageId: 'a@example.com',
			inReplyTo: 'b@example.com',
			references: ['c@example.com', 'b@example.com'],
			fromAddress: 'jo@example.com',
			fromName: 'Jo',
			toAddresses: [{ address: 'support@example.com', name: 'Support' }],
			ccAddresses: [{ address: 'cc@example.com', name: null }],
			subject: 'Printer',
			textBody: 'It is broken.',
			htmlBody: '<p>It is broken.</p>',
			sentAt,
			receivedAt,
			createdAt: now
		});
		expect(await attachmentsOf(record.id)).toMatchObject([
			{ ...attachment, providerAttachmentId: 'file-1' }
		]);
	});

	test('accepts an email with almost nothing in it', async () => {
		expect(await stored()).toMatchObject({
			messageId: null,
			fromAddress: null,
			subject: null,
			textBody: null,
			htmlBody: null,
			references: [],
			toAddresses: []
		});
	});

	test('saves nothing when an attachment cannot be saved', async () => {
		const file = { ...attachment, providerAttachmentId: 'same-id' };

		await expect(storeEmail(testDb, email({ attachments: [file, file] }), now)).rejects.toThrow();
		expect(await emailCount()).toBe(0);
	});

	test('joins the transaction of its caller', async () => {
		await expect(
			testDb.transaction(async (tx) => {
				await storeEmail(tx, email(), now);
				throw new Error('The caller failed.');
			})
		).rejects.toThrow('The caller failed.');
		expect(await emailCount()).toBe(0);
	});
});

describe('duplicates', () => {
	test('the same provider message is not stored twice', async () => {
		const first = email();

		await stored(first);

		expect(await storeEmail(testDb, first, now)).toBe('duplicate');
		expect(await emailCount()).toBe(1);
	});

	test('the same provider ID at another provider is a different email', async () => {
		const first = email();

		await stored(first);

		expect(await stored({ ...first, provider: 'other-provider' })).toMatchObject({
			provider: 'other-provider'
		});
	});

	test('the same Message-ID is not stored twice, and neither are its attachments', async () => {
		await stored(email({ messageId: '<a@example.com>' }));

		expect(
			await storeEmail(
				testDb,
				email({
					messageId: 'a@example.com',
					attachments: [{ ...attachment, providerAttachmentId: 'file-1' }]
				}),
				now
			)
		).toBe('duplicate');
		expect(await emailCount()).toBe(1);
		expect(await testDb.select().from(emailAttachments)).toEqual([]);
	});

	test('emails without a Message-ID do not collide', async () => {
		await stored();
		await stored();

		expect(await emailCount()).toBe(2);
	});
});

describe('database rules', () => {
	const row = {
		direction: 'inbound',
		provider: 'test-provider',
		mailbox: 'support@example.com',
		receivedAt
	} as const;

	test.each([
		['a blank provider', { provider: ' ' }, 'emails_provider_not_blank'],
		[
			'a blank provider message ID',
			{ providerMessageId: ' ' },
			'emails_provider_message_id_not_blank'
		],
		['a blank mailbox', { mailbox: ' ' }, 'emails_mailbox_not_blank'],
		['a blank Message-ID', { messageId: ' ' }, 'emails_message_id_not_blank'],
		['an outbound email without a ticket', { direction: 'outbound' }, 'emails_outbound_has_ticket']
	] as const)('rejects %s', async (_name, values, constraint) => {
		await expect(
			testDb.insert(emails).values({ ...row, providerMessageId: 'db-rule', ...values })
		).rejects.toMatchObject({ cause: { code: '23514', constraint } });
	});

	test('accepts an outbound email with a ticket', async () => {
		const ticket = await insertTicket();

		await testDb.insert(emails).values({
			...row,
			direction: 'outbound',
			providerMessageId: 'outbound',
			ticketId: ticket.id
		});
		await testDb.delete(emails);
		await deleteTestTicket(ticket.id);
	});

	test('a ticket with emails cannot be deleted', async () => {
		const ticket = await insertTicket();
		const record = await stored();

		await testDb.update(emails).set({ ticketId: ticket.id }).where(eq(emails.id, record.id));

		await expect(testDb.delete(tickets).where(eq(tickets.id, ticket.id))).rejects.toMatchObject({
			cause: { code: '23001', constraint: 'emails_ticket_id_tickets_id_fk' }
		});

		await testDb.delete(emails);
		await deleteTestTicket(ticket.id);
	});

	test('attachments are deleted with their email', async () => {
		const record = await stored(
			email({ attachments: [{ ...attachment, providerAttachmentId: 'file-1' }] })
		);

		await testDb.delete(emails).where(eq(emails.id, record.id));

		expect(await attachmentsOf(record.id)).toEqual([]);
	});

	test.each([
		['a negative size', { sizeBytes: -1 }, 'email_attachments_size_not_negative'],
		[
			'a blank ID',
			{ providerAttachmentId: ' ' },
			'email_attachments_provider_attachment_id_not_blank'
		]
	] as const)('rejects an attachment with %s', async (_name, values, constraint) => {
		const record = await stored();

		await expect(
			testDb.insert(emailAttachments).values({
				emailId: record.id,
				sizeBytes: 1,
				providerAttachmentId: 'file-1',
				...values
			})
		).rejects.toMatchObject({ cause: { code: '23514', constraint } });
	});

	test('stores no file content', async () => {
		const { rows } = await testDb.execute<{ data_type: string }>(
			sql`SELECT data_type FROM information_schema.columns WHERE table_name IN ('emails', 'email_attachments') AND data_type = 'bytea'`
		);

		expect(rows).toEqual([]);
	});
});
