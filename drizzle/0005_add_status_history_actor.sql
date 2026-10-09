CREATE TYPE "public"."actor_type" AS ENUM('user', 'system', 'ai');--> statement-breakpoint
ALTER TABLE "ticket_status_history" DROP CONSTRAINT "ticket_status_history_ticket_id_tickets_id_fk";
--> statement-breakpoint
ALTER TABLE "ticket_status_history" ADD COLUMN "actor_type" "actor_type" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_status_history" ALTER COLUMN "actor_type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ticket_status_history" ADD COLUMN "actor_id" text;--> statement-breakpoint
ALTER TABLE "ticket_status_history" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "ticket_status_history" ADD COLUMN "resolution" "ticket_resolution";--> statement-breakpoint
ALTER TABLE "ticket_status_history" ADD COLUMN "resolution_summary" text;--> statement-breakpoint
ALTER TABLE "ticket_status_history" ADD CONSTRAINT "ticket_status_history_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE restrict ON UPDATE no action;
