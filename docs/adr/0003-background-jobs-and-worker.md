# 0003. Background jobs and worker

- Status: Accepted
- Date: 2026-10-04
- Supersedes: the `ai_jobs` and `ai_job_attempts` tables in the original project description

## Context

AI analysis is not the only background work. Email sync, sending replies, bounce processing and overdue checks all need durable, retryable execution. Claiming, locking, retries and crash recovery are the hardest parts of the backend to get right. AI inference on the target hardware (CPU only) can take many minutes per ticket.

## Decision

**One generic queue.** `jobs` (type, payload, queue, status, `run_at`, attempt count, lock) and `job_attempts` (one row per try with outcome and error). Payloads are validated with a Zod discriminated union keyed by job type, when enqueued and when claimed.

**AI tables build on it.** `ai_suggestions` references the job attempt that produced it and records model, prompt version and input; `ai_suggestion_reviews` records human decisions. Re-analysis is a new job; model replacement is visible per suggestion.

**Separate queues.** A `queue` column (for example `default` and `ai`) with its own concurrency, so slow AI jobs never block email sync.

**Separate worker process, same codebase.** The worker is a second entry point (`src/worker/`), not a separate service. The database is the only interface between web app and worker. Jobs are claimed with `FOR UPDATE SKIP LOCKED`.

**Framework-neutral server modules.** Configuration, logging, database setup and services must not import SvelteKit modules (`$app`, `$env`), so the worker can reuse them.

## Consequences

- The queue is built before email and reused by AI later.
- Job rows are operational data that can be cleaned up; suggestions and reviews are the permanent record.
- The worker needs the same database pool error handling as the web app; a shared `createDb` factory will provide it.
