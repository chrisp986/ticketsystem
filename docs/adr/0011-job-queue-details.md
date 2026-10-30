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

**Clean-up.** Job rows are operational data (ADR 0003), so attempts are deleted with their job.

## Consequences

- A job's work must tolerate running twice: a worker can finish its work and die before recording it.
- The worker needs a clock margin: the lock must be renewed well before it expires, or a slow job is run twice.
- AI suggestions will reference job attempts (ADR 0003). Deleting a job then must not delete the record of a suggestion; Phase 6 settles this when it adds the reference.
