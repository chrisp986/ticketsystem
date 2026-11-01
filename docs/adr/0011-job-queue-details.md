# 0011. Job queue details

- Status: Accepted
- Date: 2026-10-30

## Context

ADR 0003 decides on one generic queue in the database, a separate worker process and claiming with `FOR UPDATE SKIP LOCKED`. It leaves open how a job's life is recorded, how a crashed worker is noticed and how duplicate jobs are avoided. Phase 3 is done when killing the worker mid-job loses nothing.

## Decision

**Status.** A job is `queued`, `running`, `succeeded` or `dead`. A job that failed and will be retried returns to `queued` with a later `run_at`; `dead` means it used its last attempt. The database enforces that a running job has a lock, that no other job has one, and that exactly the finished jobs have `finished_at`.

**A lock that expires.** A worker holds a job through `locked_by` and `locked_until` and renews the lock while it works. A killed worker stops renewing, so its lock expires and the job can be recovered (step 3.4). A flag alone could not tell a slow worker from a dead one.

**Enqueuing joins the caller's transaction.** `enqueueJob` takes a database or a transaction. A change and the job it needs are saved together or not at all.

**Deduplication.** A job may have a `dedupe_key`, unique among queued and running jobs. Enqueuing a duplicate returns `duplicate` and writes nothing. A finished job no longer blocks its key, so recurring work can run again.

**Types live in code.** `type` is text, not a database enum, so a new job type needs no migration. A Zod discriminated union validates the payload when a job is enqueued and when it is claimed (ADR 0003). The queue follows from the type, so a job cannot be put on the wrong queue by accident.

**Attempts.** `job_attempts` has one row per try, with the number, worker, times, outcome (`succeeded`, `failed` or `lost`, the last for an expired lock) and an error. The error is a message for operators and must not contain customer data (ADR 0004). `max_attempts` defaults to 5.

**Claiming and finishing.** A short transaction claims a job and writes its attempt, and the job runs outside it, because a job can take minutes. A result is only recorded while the worker still holds the job, so a worker that lost its lock cannot overwrite a newer try.

**Retries.** A failed job waits 1 minute, 5 minutes, 25 minutes, then at most 2 hours before its next attempt, so the default 5 attempts span about 2.5 hours. An invalid payload or unknown job type goes straight to `dead`, because retrying cannot fix it. The database enforces that a queued job has attempts left, so a claim can never exceed the limit and block its queue. A dead job is run again with SQL for now.

**Renewal and recovery.** A lock lasts 5 minutes and is renewed every 100 seconds while the job runs, so one failed renewal does not lose it. Each worker looks for expired locks at startup and every 30 seconds. The attempt becomes `lost`, and the job then follows the rules for a failure, so a job that kills its worker every time ends up `dead`. A worker that lost its lock is not interrupted, since that would need cancellation in every handler; its result is discarded. A result that arrives after the lock expired but before recovery is kept, because nobody else has started the job.

**Recurring jobs.** The worker enqueues them at startup and at a fixed interval. A dedupe key keeps only one queued or running, however many workers run. The overdue check runs every 5 minutes with a single attempt: a retry would hold the key and block fresher runs, and the next run repeats the work anyway.

**Shutdown.** On `SIGTERM` or `SIGINT` the worker stops claiming and waits up to 30 seconds for running jobs. A job still running then keeps its lock and is recovered like that of a killed worker.

**Running the worker.** `pnpm worker` runs the TypeScript source with `tsx`. Bundling it is deferred until there is a deployment to bundle for.

**Clean-up.** Job rows are operational data (ADR 0003), so attempts are deleted with their job.

## Consequences

- A job's work must tolerate running twice: a worker can finish its work and die before recording it.
- The worker needs a clock margin: the lock must be renewed well before it expires, or a slow job is run twice.
- AI suggestions will reference job attempts (ADR 0003). Deleting a job then must not delete the record of a suggestion; Phase 6 settles this when it adds the reference.
