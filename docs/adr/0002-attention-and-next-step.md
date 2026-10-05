# 0002. Attention flag and next step

- Status: Accepted
- Date: 2026-10-04

## Context

A ticket's status says where it is in the workflow, but not whether a human must act now. Tickets also tend to sit without a clear plan. Encoding "customer replied" as a status would multiply statuses and blur the lifecycle defined in ADR 0001.

## Decision

**Attention is orthogonal to status.** Each ticket has `attention_since` (nullable timestamp) and `attention_reason`.

- Set by: an inbound customer email, a reopen, a bounce of an outgoing email, an overdue next step. Auto-replies do not set it.
- Cleared by: a human reply, a human status change, or an explicit "mark as handled". Viewing a ticket never clears it.
- Several emails keep the earliest `attention_since`, so the queue sorts by the longest wait.
- A reply clears only attention that existed when the agent loaded the ticket; the ticket version detects messages that arrived meanwhile.
- Every set and clear is recorded with actor and clear type (`reply`, `status_change`, `manual`).

**Every open ticket has a future.** Each ticket has `next_step`, `next_step_due` and later `next_step_owner`. The database enforces: a ticket that is not closed has either a next step due date or attention.

| Status             | Next step                               |
| ------------------ | --------------------------------------- |
| `new`              | Triage (attention set on creation)      |
| `in_progress`      | Entered by the agent, required          |
| `waiting_customer` | Follow up if no reply, default due date |
| `waiting_internal` | Entered by the agent, required          |
| `resolved`         | Await confirmation, then close          |

An overdue next step raises attention with reason `next_step_overdue`. Overdue tickets can be listed with a query, without a job queue.

**Later.** Manual attention is modeled as a timed follow-up with a required note, not a bare flag. Once a ticket can have several reasons at once, the columns move into an `attention_items` table.

## Consequences

- Every attention reason must mean "a human must act"; informational events belong in the ticket timeline, or people learn to ignore the flag.
- Agents must enter a next step for some transitions; defaults and quick due-date buttons keep this cheap.
- Ownership needs users and assignment, which is why they come early in the roadmap.
