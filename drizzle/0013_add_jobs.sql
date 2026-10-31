CREATE TYPE "public"."job_attempt_outcome" AS ENUM('succeeded', 'failed', 'lost');--> statement-breakpoint
CREATE TYPE "public"."job_queue" AS ENUM('default', 'ai');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'dead');--> statement-breakpoint
CREATE TABLE "job_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"worker_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" "job_attempt_outcome",
	"error" text,
	CONSTRAINT "job_attempts_number_positive" CHECK ("job_attempts"."attempt_number" > 0),
	CONSTRAINT "job_attempts_outcome_when_finished" CHECK (("job_attempts"."finished_at" IS NOT NULL) = ("job_attempts"."outcome" IS NOT NULL)),
	CONSTRAINT "job_attempts_no_error_on_success" CHECK ("job_attempts"."outcome" IS DISTINCT FROM 'succeeded' OR "job_attempts"."error" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"queue" "job_queue" NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"locked_by" text,
	"locked_until" timestamp with time zone,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "jobs_type_not_blank" CHECK ("jobs"."type" ~ '[^[:space:]]'),
	CONSTRAINT "jobs_dedupe_key_not_blank" CHECK ("jobs"."dedupe_key" IS NULL OR "jobs"."dedupe_key" ~ '[^[:space:]]'),
	CONSTRAINT "jobs_lock_only_when_running" CHECK (("jobs"."status" = 'running') = ("jobs"."locked_by" IS NOT NULL) AND ("jobs"."status" = 'running') = ("jobs"."locked_until" IS NOT NULL)),
	CONSTRAINT "jobs_finished_at_matches_status" CHECK (("jobs"."status" IN ('succeeded', 'dead')) = ("jobs"."finished_at" IS NOT NULL)),
	CONSTRAINT "jobs_attempts_within_limit" CHECK ("jobs"."max_attempts" > 0 AND "jobs"."attempts" >= 0 AND "jobs"."attempts" <= "jobs"."max_attempts")
);
--> statement-breakpoint
ALTER TABLE "job_attempts" ADD CONSTRAINT "job_attempts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_attempts_job_id_attempt_number_idx" ON "job_attempts" USING btree ("job_id","attempt_number");--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("queue","run_at") WHERE "jobs"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "jobs_locked_until_idx" ON "jobs" USING btree ("locked_until") WHERE "jobs"."status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_key_idx" ON "jobs" USING btree ("dedupe_key") WHERE "jobs"."status" IN ('queued', 'running');