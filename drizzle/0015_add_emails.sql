CREATE TYPE "public"."email_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TABLE "email_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_id" uuid NOT NULL,
	"file_name" text,
	"content_type" text,
	"size_bytes" integer NOT NULL,
	"provider_attachment_id" text NOT NULL,
	CONSTRAINT "email_attachments_size_not_negative" CHECK ("email_attachments"."size_bytes" >= 0),
	CONSTRAINT "email_attachments_provider_attachment_id_not_blank" CHECK ("email_attachments"."provider_attachment_id" ~ '[^[:space:]]')
);
--> statement-breakpoint
CREATE TABLE "emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid,
	"direction" "email_direction" NOT NULL,
	"provider" text NOT NULL,
	"provider_message_id" text NOT NULL,
	"mailbox" text NOT NULL,
	"message_id" text,
	"in_reply_to" text,
	"references" text[] DEFAULT '{}'::text[] NOT NULL,
	"from_address" text,
	"from_name" text,
	"to_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cc_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text,
	"text_body" text,
	"html_body" text,
	"sent_at" timestamp with time zone,
	"received_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "emails_provider_not_blank" CHECK ("emails"."provider" ~ '[^[:space:]]'),
	CONSTRAINT "emails_provider_message_id_not_blank" CHECK ("emails"."provider_message_id" ~ '[^[:space:]]'),
	CONSTRAINT "emails_mailbox_not_blank" CHECK ("emails"."mailbox" ~ '[^[:space:]]'),
	CONSTRAINT "emails_message_id_not_blank" CHECK ("emails"."message_id" IS NULL OR "emails"."message_id" ~ '[^[:space:]]'),
	CONSTRAINT "emails_outbound_has_ticket" CHECK ("emails"."direction" <> 'outbound' OR "emails"."ticket_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_attachments_email_id_provider_attachment_id_idx" ON "email_attachments" USING btree ("email_id","provider_attachment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emails_provider_message_idx" ON "emails" USING btree ("provider","provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emails_message_id_idx" ON "emails" USING btree ("message_id") WHERE "emails"."message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "emails_ticket_id_received_at_idx" ON "emails" USING btree ("ticket_id","received_at");