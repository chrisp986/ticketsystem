CREATE TYPE "public"."assignment_field" AS ENUM('assignee', 'next_step_owner');--> statement-breakpoint
CREATE TABLE "ticket_assignment_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"field" "assignment_field" NOT NULL,
	"previous_user_id" uuid,
	"new_user_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_assignment_history_user_changed" CHECK ("ticket_assignment_history"."previous_user_id" IS DISTINCT FROM "ticket_assignment_history"."new_user_id")
);
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "assignee_id" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "next_step_owner_id" uuid;--> statement-breakpoint
ALTER TABLE "ticket_assignment_history" ADD CONSTRAINT "ticket_assignment_history_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_assignment_history" ADD CONSTRAINT "ticket_assignment_history_previous_user_id_users_id_fk" FOREIGN KEY ("previous_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_assignment_history" ADD CONSTRAINT "ticket_assignment_history_new_user_id_users_id_fk" FOREIGN KEY ("new_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_assignment_history" ADD CONSTRAINT "ticket_assignment_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_assignment_history_ticket_id_changed_at_idx" ON "ticket_assignment_history" USING btree ("ticket_id","changed_at");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_next_step_owner_id_users_id_fk" FOREIGN KEY ("next_step_owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tickets_assignee_id_status_idx" ON "tickets" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE INDEX "tickets_next_step_owner_id_next_step_due_idx" ON "tickets" USING btree ("next_step_owner_id","next_step_due");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_next_step_owner_only_when_open" CHECK ("tickets"."status" <> 'closed' OR "tickets"."next_step_owner_id" IS NULL);