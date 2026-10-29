# 0005. Ticket notes and non-email contact

- Status: Accepted
- Date: 2026-10-04
- Amended: 2026-10-29 (implementation details, see Decision)

## Context

The system is email-based, but customers also answer by phone or on site, and colleagues pass information on. Without a record on the ticket, such contact leaves no trace: the history shows a status change with no visible cause, and later AI summaries miss part of the case.

## Decision

**Agents can add manual notes to a ticket.** A note has a `kind` (`internal_note`, `phone_call`, `on_site`), a text, an author and a timestamp.

- Notes are internal. They are never sent to the customer.
- Notes are append-only. A correction is a new note.
- Notes appear in the ticket timeline together with emails and status changes.
- A note alone does not clear attention and does not change the status (ADR 0002). The note form can be submitted together with a status change and next step, so "customer called, part ordered" is one action.
- Telephony integration is out of scope.

**Amendment (2026-10-29).** Step 2.4 settles what this ADR left open:

- The author is a user (`author_id`, a foreign key to `users` with `restrict`). Only people write notes; if the system or AI ever needs to, a new ADR decides it (ADR 0009).
- Notes can be added to closed tickets. A note changes nothing on the ticket, so it does not conflict with "closed is final" (ADR 0001); it records contact that happens after closing.
- Adding a note does not change the ticket row: its version and `updated_at` stay, so a note never causes a conflict in another agent's open form. A note submitted with a status change is written in the same transaction; if the change is rejected, the note is not saved.
- A note's time is when it was written. The time of the call or visit goes into the text; a separate field can follow if it is needed.
- The text is trimmed, must not be blank and is at most 10,000 characters. It is never logged (ADR 0004).

## Consequences

- Notes need an author, so they are implemented after authentication (Phase 2).
- Until then, the reason on a status change records contact outside email.
- AI summaries must read notes as well as emails.
