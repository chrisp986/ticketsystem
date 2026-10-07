CREATE TYPE "public"."ticket_resolution" AS ENUM('solved', 'workaround', 'duplicate', 'not_actionable', 'withdrawn', 'no_response', 'wont_fix');--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "resolution" "ticket_resolution";--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "resolution_summary" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "first_resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "reopen_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "tickets" SET "first_resolved_at" = "resolved_at" WHERE "resolved_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_reopen_count_not_negative" CHECK ("tickets"."reopen_count" >= 0);--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_resolved_at_has_first_resolved_at" CHECK ("tickets"."resolved_at" IS NULL OR "tickets"."first_resolved_at" IS NOT NULL);
