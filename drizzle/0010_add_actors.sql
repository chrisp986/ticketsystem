-- ADR 0009: rows written before sign-in have no valid actor and must be removed by hand before this migration runs.
DO $$
DECLARE
	"invalid_rows" bigint;
BEGIN
	SELECT
		(SELECT count(*) FROM "ticket_status_history" AS "h"
			WHERE "h"."actor_type" <> 'user'
				OR NOT EXISTS (SELECT 1 FROM "users" WHERE "users"."id"::text = lower("h"."actor_id")))
		+ (SELECT count(*) FROM "ticket_attention_events" AS "e"
			WHERE "e"."actor_type" <> 'user'
				OR NOT EXISTS (SELECT 1 FROM "users" WHERE "users"."id"::text = lower("e"."actor_id")))
		+ (SELECT count(*) FROM "ticket_assignment_history"
			WHERE "actor_type" <> 'user' OR "actor_id" IS NULL)
		+ (SELECT count(*) FROM "tickets" AS "t"
			WHERE NOT EXISTS (
				SELECT 1 FROM "ticket_attention_events" AS "e"
				WHERE "e"."ticket_id" = "t"."id" AND "e"."event_type" = 'raised' AND "e"."reason" = 'new_ticket'
			))
	INTO "invalid_rows";

	IF "invalid_rows" > 0 THEN
		RAISE EXCEPTION '% rows have no valid actor (ADR 0009)', "invalid_rows"
			USING HINT = 'History rows need actor type user and the ID of an existing user, and every ticket needs a new_ticket attention event. Delete or fix these rows, then run the migration again.';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "ticket_attention_events" ALTER COLUMN "actor_id" SET DATA TYPE uuid USING "actor_id"::uuid;--> statement-breakpoint
ALTER TABLE "ticket_status_history" ALTER COLUMN "actor_id" SET DATA TYPE uuid USING "actor_id"::uuid;--> statement-breakpoint
ALTER TABLE "ticket_assignment_history" ADD COLUMN "actor_name" text;--> statement-breakpoint
ALTER TABLE "ticket_attention_events" ADD COLUMN "actor_name" text;--> statement-breakpoint
ALTER TABLE "ticket_status_history" ADD COLUMN "actor_name" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "created_by_type" "actor_type";--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "created_by_id" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "created_by_name" text;--> statement-breakpoint
UPDATE "tickets" SET "created_by_type" = "creation"."actor_type", "created_by_id" = "creation"."actor_id", "created_by_name" = "creation"."actor_name"
FROM (
	SELECT DISTINCT ON ("ticket_id") "ticket_id", "actor_type", "actor_id", "actor_name"
	FROM "ticket_attention_events"
	WHERE "event_type" = 'raised' AND "reason" = 'new_ticket'
	ORDER BY "ticket_id", "occurred_at", "id"
) AS "creation"
WHERE "creation"."ticket_id" = "tickets"."id";--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "created_by_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_attention_events" ADD CONSTRAINT "ticket_attention_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_status_history" ADD CONSTRAINT "ticket_status_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_assignment_history" ADD CONSTRAINT "ticket_assignment_history_actor_valid" CHECK (("ticket_assignment_history"."actor_type" = 'user' AND "ticket_assignment_history"."actor_id" IS NOT NULL AND "ticket_assignment_history"."actor_name" IS NULL) OR ("ticket_assignment_history"."actor_type" <> 'user' AND "ticket_assignment_history"."actor_id" IS NULL AND "ticket_assignment_history"."actor_name" IS NOT NULL AND btrim("ticket_assignment_history"."actor_name") <> '' AND "ticket_assignment_history"."actor_name" = lower("ticket_assignment_history"."actor_name") AND char_length("ticket_assignment_history"."actor_name") <= 100));--> statement-breakpoint
ALTER TABLE "ticket_attention_events" ADD CONSTRAINT "ticket_attention_events_actor_valid" CHECK (("ticket_attention_events"."actor_type" = 'user' AND "ticket_attention_events"."actor_id" IS NOT NULL AND "ticket_attention_events"."actor_name" IS NULL) OR ("ticket_attention_events"."actor_type" <> 'user' AND "ticket_attention_events"."actor_id" IS NULL AND "ticket_attention_events"."actor_name" IS NOT NULL AND btrim("ticket_attention_events"."actor_name") <> '' AND "ticket_attention_events"."actor_name" = lower("ticket_attention_events"."actor_name") AND char_length("ticket_attention_events"."actor_name") <= 100));--> statement-breakpoint
ALTER TABLE "ticket_status_history" ADD CONSTRAINT "ticket_status_history_actor_valid" CHECK (("ticket_status_history"."actor_type" = 'user' AND "ticket_status_history"."actor_id" IS NOT NULL AND "ticket_status_history"."actor_name" IS NULL) OR ("ticket_status_history"."actor_type" <> 'user' AND "ticket_status_history"."actor_id" IS NULL AND "ticket_status_history"."actor_name" IS NOT NULL AND btrim("ticket_status_history"."actor_name") <> '' AND "ticket_status_history"."actor_name" = lower("ticket_status_history"."actor_name") AND char_length("ticket_status_history"."actor_name") <= 100));--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_created_by_valid" CHECK (("tickets"."created_by_type" = 'user' AND "tickets"."created_by_id" IS NOT NULL AND "tickets"."created_by_name" IS NULL) OR ("tickets"."created_by_type" <> 'user' AND "tickets"."created_by_id" IS NULL AND "tickets"."created_by_name" IS NOT NULL AND btrim("tickets"."created_by_name") <> '' AND "tickets"."created_by_name" = lower("tickets"."created_by_name") AND char_length("tickets"."created_by_name") <= 100));