CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."ticket_source" AS ENUM('manual', 'email', 'web', 'api');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('new', 'in_progress', 'waiting_customer', 'waiting_internal', 'resolved', 'closed');--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_number" integer GENERATED ALWAYS AS IDENTITY (sequence name "tickets_ticket_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"subject" text NOT NULL,
	"description" text,
	"status" "ticket_status" DEFAULT 'new' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'medium' NOT NULL,
	"source" "ticket_source" DEFAULT 'manual' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_ticket_number_unique" UNIQUE("ticket_number")
);
--> statement-breakpoint
CREATE INDEX "tickets_status_created_at_idx" ON "tickets" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "tickets_priority_status_idx" ON "tickets" USING btree ("priority","status");