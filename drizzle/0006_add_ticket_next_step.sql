ALTER TABLE "tickets" ADD COLUMN "next_step" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "next_step_due" timestamp with time zone DEFAULT now();--> statement-breakpoint
UPDATE "tickets" SET "next_step" = 'Review this ticket' WHERE "status" <> 'closed';--> statement-breakpoint
UPDATE "tickets" SET "next_step_due" = NULL WHERE "status" = 'closed';--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_open_has_next_step_due" CHECK ("tickets"."status" = 'closed' OR "tickets"."next_step_due" IS NOT NULL);
