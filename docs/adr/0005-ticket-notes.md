# 0005. Ticket notes and non-email contact

- Status: Accepted
- Date: 2026-10-04

## Context

The system is email-based, but customers also answer by phone or on site, and colleagues pass information on. Without a record on the ticket, such contact leaves no trace: the history shows a status change with no visible cause, and later AI summaries miss part of the case.

## Decision

**Agents can add manual notes to a ticket.** A note has a `kind` (`internal_note`, `phone_call`, `on_site`), a text, an author and a timestamp.

- Notes are internal. They are never sent to the customer.
- Notes are append-only. A correction is a new note.
- Notes appear in the ticket timeline together with emails and status changes.
- A note alone does not clear attention and does not change the status (ADR 0002). The note form can be submitted together with a status change and next step, so "customer called, part ordered" is one action.
- Telephony integration is out of scope.

## Consequences

- Notes need an author, so they are implemented after authentication (Phase 2).
- Until then, the reason on a status change records contact outside email.
- AI summaries must read notes as well as emails.
