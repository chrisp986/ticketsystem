import { sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';

import { emailDirections } from '$lib/modules/emails/email.constants';
import type { EmailAddress } from '$lib/modules/emails/email.validation';

import { notBlank } from './not-blank';
import { tickets } from './tickets';

export const emailDirection = pgEnum('email_direction', emailDirections);

/**
 * Emails, independent of the provider they came from (ADR 0012).
 *
 * Everything the sender controls is untrusted. Addresses, subjects and bodies are customer data
 * and never go in logs or job errors, and `html_body` must be sanitized before it is displayed.
 */
export const emails = pgTable(
	'emails',
	{
		id: uuid('id').defaultRandom().primaryKey(),

		// Empty until threading links the email to a ticket (step 4.4).
		ticketId: uuid('ticket_id').references(() => tickets.id, { onDelete: 'restrict' }),

		direction: emailDirection('direction').notNull(),

		provider: text('provider').notNull(),

		providerMessageId: text('provider_message_id').notNull(),

		mailbox: text('mailbox').notNull(),

		messageId: text('message_id'),

		inReplyTo: text('in_reply_to'),

		references: text('references')
			.array()
			.default(sql`'{}'::text[]`)
			.notNull(),

		fromAddress: text('from_address'),

		fromName: text('from_name'),

		toAddresses: jsonb('to_addresses').$type<EmailAddress[]>().default([]).notNull(),

		ccAddresses: jsonb('cc_addresses').$type<EmailAddress[]>().default([]).notNull(),

		subject: text('subject'),

		textBody: text('text_body'),

		htmlBody: text('html_body'),

		// From the email's Date header, which the sender controls.
		sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),

		receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' }).notNull(),

		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('emails_provider_message_idx').on(table.provider, table.providerMessageId),
		uniqueIndex('emails_message_id_idx')
			.on(table.messageId)
			.where(sql`${table.messageId} IS NOT NULL`),
		index('emails_ticket_id_received_at_idx').on(table.ticketId, table.receivedAt),
		check('emails_provider_not_blank', notBlank(table.provider)),
		check('emails_provider_message_id_not_blank', notBlank(table.providerMessageId)),
		check('emails_mailbox_not_blank', notBlank(table.mailbox)),
		check(
			'emails_message_id_not_blank',
			sql`${table.messageId} IS NULL OR ${notBlank(table.messageId)}`
		),
		check(
			'emails_outbound_has_ticket',
			sql`${table.direction} <> 'outbound' OR ${table.ticketId} IS NOT NULL`
		)
	]
);

/**
 * What an email had attached. The files stay with the provider (ADR 0012).
 */
export const emailAttachments = pgTable(
	'email_attachments',
	{
		id: uuid('id').defaultRandom().primaryKey(),

		emailId: uuid('email_id')
			.notNull()
			.references(() => emails.id, { onDelete: 'cascade' }),

		fileName: text('file_name'),

		contentType: text('content_type'),

		sizeBytes: integer('size_bytes').notNull(),

		providerAttachmentId: text('provider_attachment_id').notNull()
	},
	(table) => [
		uniqueIndex('email_attachments_email_id_provider_attachment_id_idx').on(
			table.emailId,
			table.providerAttachmentId
		),
		check('email_attachments_size_not_negative', sql`${table.sizeBytes} >= 0`),
		check(
			'email_attachments_provider_attachment_id_not_blank',
			notBlank(table.providerAttachmentId)
		)
	]
);

export type EmailRecord = typeof emails.$inferSelect;
