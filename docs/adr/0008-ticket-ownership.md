# 0008. Ticket ownership

- Status: Accepted
- Date: 2026-10-25
- Amended: 2026-10-29 (views, see Decision)

## Context

ADR 0002 gives every open ticket a next step, but nobody is named for it. Since ADR 0007 agents sign in, so a ticket can belong to a person. Phase 2 needs views such as "my tickets" and "unassigned", and later metrics per agent.

## Decision

**Two kinds of ownership.** The `assignee` is responsible for the ticket as a whole. The `next_step_owner` must do the current next step; usually that is the assignee, sometimes a colleague (for example on a `waiting_internal` ticket). Both are optional references to `users`.

- New tickets start unassigned. The triage step of a `new` ticket belongs to the team, so it has no owner unless the ticket is assigned.
- When a person moves an unassigned ticket out of `new`, they become its assignee.
- When the assignee changes, the next-step owner follows if it was empty or the previous assignee. An owner that was set to someone else stays, unless the same change sets it.
- A status change creates a new next step; its owner is chosen in the status form and defaults to the assignee.
- Closing a ticket clears the next-step owner; the database enforces this. The assignee stays for metrics. Closed tickets cannot be reassigned.
- Only active users can become assignee or owner. Deactivating a user does not reassign their tickets; the UI marks them as inactive. Users referenced by a ticket or its history cannot be deleted.
- Assigning a ticket does not change its status and does not clear attention (ADR 0002).
- Only people assign tickets. The system and AI may later suggest an assignee, never set one.

**Views (amendment 2026-10-29).** Step 2.5 adds three views to the ticket list. They show open tickets only and are sorted by how long a ticket has been waiting.

- _My tickets_: I am the assignee or the next-step owner. A colleague who owns the next step of a `waiting_internal` ticket sees it too.
- _My overdue_: the next step is overdue and mine. It is mine when I own it, or when nobody owns it and I am the assignee, so no overdue step is left without a person.
- _Unassigned_: no assignee, including new tickets waiting for triage.

The list opens on _My tickets_. Every view shows how many tickets it holds, regardless of the status filter and search.

**History.** Every change of assignee or next-step owner is recorded in `ticket_assignment_history` with the field, the previous and new user, the actor type, the actor and the time. Actor IDs in this table are user IDs with a foreign key.

## Consequences

- Assignment needs the signed-in user, so ticket forms now pass the user as the actor. Status history and attention events therefore record the actor ID for changes made in the UI. Step 2.3 still converts their `text` actor columns to user references and shows actors in the UI.
- There is no database rule that an open ticket has an owner; the views in step 2.5 surface unassigned tickets instead.
- The next-step owner can be changed without a status change, but the next step itself cannot yet (backlog).
