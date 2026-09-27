CREATE TABLE "ticket_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"previous_status" "ticket_status" NOT NULL,
	"new_status" "ticket_status" NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_status_history" ADD CONSTRAINT "ticket_status_history_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_status_history_ticket_id_changed_at_idx" ON "ticket_status_history" USING btree ("ticket_id","changed_at");