CREATE TYPE "public"."attention_clear_type" AS ENUM('reply', 'status_change', 'manual');--> statement-breakpoint
CREATE TYPE "public"."attention_event_type" AS ENUM('raised', 'cleared');--> statement-breakpoint
CREATE TYPE "public"."attention_reason" AS ENUM('new_ticket', 'customer_reply', 'reopened', 'bounce', 'next_step_overdue');--> statement-breakpoint
CREATE TABLE "ticket_attention_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"event_type" "attention_event_type" NOT NULL,
	"reason" "attention_reason" NOT NULL,
	"clear_type" "attention_clear_type",
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_attention_events_clear_type_only_when_cleared" CHECK (("ticket_attention_events"."event_type" = 'cleared') = ("ticket_attention_events"."clear_type" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "attention_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "attention_reason" "attention_reason";--> statement-breakpoint
UPDATE "tickets" SET "attention_since" = "created_at", "attention_reason" = 'new_ticket' WHERE "status" = 'new';--> statement-breakpoint
ALTER TABLE "ticket_attention_events" ADD CONSTRAINT "ticket_attention_events_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_attention_events_ticket_id_occurred_at_idx" ON "ticket_attention_events" USING btree ("ticket_id","occurred_at");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_attention_fields_together" CHECK (("tickets"."attention_since" IS NULL) = ("tickets"."attention_reason" IS NULL));--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_attention_only_when_open" CHECK ("tickets"."status" <> 'closed' OR "tickets"."attention_since" IS NULL);
