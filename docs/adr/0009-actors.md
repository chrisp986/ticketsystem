# 0009. Actors

- Status: Accepted
- Date: 2026-10-25

## Context

ADR 0001 records an actor type, an actor and a reason for every status change, and ADR 0002 records an actor for every attention event. Since ADR 0008 the ticket forms pass the signed-in user, but the status history and attention events still store the actor ID as free `text` without a foreign key, nothing requires a user actor to have an ID, and a ticket does not record who created it. The worker (Phase 3) and email sync (Phase 4) will soon change tickets as the system, and AI may later change tickets itself once it decides reliably. Each of them must be recorded in a way that says exactly which component acted.

## Decision

**Every change has an actor.** Every row that records a change — status history, attention events, assignment history — and every ticket (its creator) stores an actor with three columns: the actor type, a user ID and a name.

| Actor type | User ID                      | Name                                                |
| ---------- | ---------------------------- | --------------------------------------------------- |
| `user`     | Required, references `users` | Empty                                               |
| `system`   | Empty                        | Required: the component, for example `email-sync`   |
| `ai`       | Empty                        | Required: the model and prompt version that decided |

A check constraint enforces this table on every one of these tables. In code, `Actor` is a union of `{ type: 'user', id }` and `{ type: 'system' | 'ai', name }`, so an actor without its identifier does not type-check. Names are short, stable, lower-case identifiers; a renamed component keeps its old name in history.

**Tickets record their creator** in `created_by_type`, `created_by_id` and `created_by_name`. Existing tickets take the actor of their `new_ticket` attention event.

**AI may act later.** The `ai` type stays. Today AI only suggests: only a person closes a ticket (ADR 0001) and only people assign tickets (ADR 0008). When AI is trusted to make a change itself, a new ADR names the change and supersedes the rule that forbids it. The history then already records which model and prompt made the change, so its decisions can be evaluated and audited (Phase 9).

**Users are deactivated, never deleted.** Every actor and owner reference to `users` uses `restrict`, so history keeps naming the person who acted. A user who leaves is set to inactive (ADR 0007); sessions are the only rows deleted with a user.

**Ticket timeline.** The ticket page shows one timeline, newest first, with the creation, status changes, attention events and assignment changes. Each entry names its actor: a user by name, marked when inactive, a system or AI actor by type and name. Ticket notes (step 2.4) join this timeline.

**Logging.** The request log line includes the signed-in user's ID, so every log line of a request can be traced to a person through the request ID. Logs never contain user names or email addresses (ADR 0004, ADR 0007). Changes are not logged a second time; the history tables are the audit trail. Jobs (Phase 3) log the actor name with the job ID.

## Consequences

- The `text` actor columns become `uuid` foreign keys. Rows written before sign-in had no actor ID; they were test data and were deleted, so the constraint is validated on all rows.
- Services can no longer be called with an anonymous user. Tests use a test user as the actor.
- The first system actor (Phase 3) and the first AI actor (Phase 6) only choose a name; the schema does not change.
- Showing the timeline needs user names for every referenced user, including inactive ones.
