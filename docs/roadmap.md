# Roadmap

Goal: a professional, AI-driven ticket system that reduces agent work to a minimum while humans keep every operational decision.

North-star metric: agent actions and time per ticket, falling from the Phase 2 baseline.

Each step is sized to roughly one pull request. A phase is done when its acceptance criteria hold and are covered by tests.

## Phase 0: Foundation

- [x] 0.1 Integration tests for ticket creation
- [x] 0.2 Lifecycle timestamp constraints and rejection tests
- [x] 0.3 Request IDs, structured logging, central error handling, error page
- [x] 0.4 Validated, framework-neutral server configuration
- [x] 0.5 adapter-node, dependency cleanup, health endpoints
- [x] 0.6 README, roadmap and first ADRs

Done when: every path to invalid data is closed, errors are traceable from screen to log, and decisions are documented.

## Phase 1: Ticket lifecycle ([ADR 0001](adr/0001-ticket-status-lifecycle.md), [ADR 0002](adr/0002-attention-and-next-step.md))

- [x] 1.1 Transition map enforced in the service, with tests for every edge
- [x] 1.2 Resolution field and summary, `first_resolved_at`, `reopen_count`, extended constraints
- [x] 1.3 History with actor type, actor and reason; foreign key `restrict`
- [ ] 1.4 Guard function returning blockers and warnings
- [ ] 1.5 Next step and due date with per-status defaults and the database invariant
- [ ] 1.6 Attention columns with manual clear
- [ ] 1.7 UI: status, next steps, blockers, attention badge, overdue filter

## Phase 2: Users and ownership ([ADR 0005](adr/0005-ticket-notes.md))

- [ ] 2.1 Session authentication and users
- [ ] 2.2 Assignee and next-step owner
- [ ] 2.3 Actor recorded on every change
- [ ] 2.4 Ticket notes (internal note, phone call, on site) in the ticket timeline
- [ ] 2.5 Views: my tickets, unassigned, my overdue
- [ ] 2.6 Baseline metrics

## Phase 3: Background jobs ([ADR 0003](adr/0003-background-jobs-and-worker.md))

- [ ] 3.1 `jobs` and `job_attempts` tables
- [ ] 3.2 Worker process claiming jobs with `FOR UPDATE SKIP LOCKED`
- [ ] 3.3 Retries, backoff, dead-letter state
- [ ] 3.4 Stale-lock recovery
- [ ] 3.5 First job: overdue next steps raise attention

Done when: killing the worker mid-job loses nothing.

## Phase 4: Inbound email

- [ ] 4.1 Provider-neutral email storage
- [ ] 4.2 Email provider interface and Gmail adapter
- [ ] 4.3 Idempotent sync job with deduplication by Message-ID
- [ ] 4.4 Threading, auto-reply and bounce detection
- [ ] 4.5 Event rules: reopen, resume, follow-up tickets

## Phase 5: Outbound email

- [ ] 5.1 Replies sent as retryable jobs with idempotency keys
- [ ] 5.2 Threading headers and stored sent mail
- [ ] 5.3 Attention cleared with the race check
- [ ] 5.4 Bounces raise attention; reply templates

## Phase 6: Thin AI slice

- [ ] 6.1 LLM provider interface and Ollama adapter
- [ ] 6.2 Minimal `ai_suggestions` table
- [ ] 6.3 Structured output validated with Zod
- [ ] 6.4 Summary from emails and notes (informational) and category (suggestion)
- [ ] 6.5 Measure latency and quality on the target hardware

## Phase 7: Human-in-the-loop

- [ ] 7.1 Suggestion reviews: accept, edit, reject with reason
- [ ] 7.2 Accepted suggestions run through the normal services and guards
- [ ] 7.3 Rule-based suggestions: ready to close, no reply
- [ ] 7.4 Attention items table, timed follow-ups, snooze

## Phase 8: Deeper analysis

- [ ] 8.1 Priority suggestion
- [ ] 8.2 Next-step suggestion
- [ ] 8.3 Re-analysis on new email, superseded suggestions
- [ ] 8.4 Thinking mode and self-consistency voting if needed

## Phase 9: AI quality

- [ ] 9.1 Prompt versioning
- [ ] 9.2 Evaluation set from human reviews
- [ ] 9.3 Benchmark script for models and prompts
- [ ] 9.4 Acceptance and edit rates, uncertainty handling
- [ ] 9.5 Embeddings with pgvector

## Phase 10: AI-assisted resolution

- [ ] 10.1 Draft replies, never sent automatically
- [ ] 10.2 Duplicate and spam suggestions
- [ ] 10.3 Resolution summary drafts
- [ ] 10.4 Batch review of low-risk suggestions

Done when: actions per ticket are below the Phase 2 baseline.

## Phase 11: Knowledge and RAG

- [ ] 11.1 Verified resolutions
- [ ] 11.2 Knowledge articles
- [ ] 11.3 Retrieval with source citations
- [ ] 11.4 Retrieval evaluation

## Backlog

- Upgrade to SvelteKit 3 (adapter-node is pinned to 5.x until then)
- Log retention and access before production use
- Optional `db:test:up` script to start and migrate the test database
