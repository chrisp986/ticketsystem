# 0001. Ticket status lifecycle

- Status: Accepted
- Date: 2026-10-04

## Context

The system has six statuses, but the service accepts any transition (including `closed → new`), a ticket can be closed without any record of why, and the status history does not record who made a change. AI will later propose status changes, so the rules must be explicit, enforced and auditable before AI is added.

## Decision

**Statuses.** `new`, `in_progress`, `waiting_customer`, `waiting_internal`, `resolved`, `closed`.

**Status and outcome are separate.** The status says where a ticket is in the workflow; a separate `resolution` field says how it ended: `solved`, `workaround`, `duplicate`, `not_actionable`, `withdrawn`, `no_response`, `wont_fix`. No outcome is encoded as a status.

**Allowed transitions.**

| From               | To                                                |
| ------------------ | ------------------------------------------------- |
| `new`              | `in_progress`, `waiting_*`, `resolved`, `closed`* |
| `in_progress`      | `waiting_*`, `resolved`, `closed`*                |
| `waiting_customer` | `in_progress`, `resolved`, `closed`*              |
| `waiting_internal` | `in_progress`, `resolved`, `closed`*              |
| `resolved`         | `in_progress` (reopen), `closed`                  |
| `closed`           | none (terminal)                                   |

\* Closing without resolving requires a resolution other than `solved` or `workaround`.

**Rules.**

- `new` is entry-only; nothing transitions back to it.
- `resolved` is set by an agent and requires a resolution summary.
- Only a human closes a ticket. The system and AI may suggest closing, never execute it.
- A guard function evaluates every transition and returns blockers (cannot proceed) and warnings (may proceed, optionally with a reason). The UI shows both, and the server re-checks on submit.
- A customer reply automatically moves `resolved` and `waiting_customer` tickets to `in_progress`. This is a deterministic system rule, not an AI decision.
- A reply on a `waiting_internal` ticket keeps the status and raises attention (ADR 0002).
- A reply to a `closed` ticket creates a new ticket linked to it as a follow-up.
- Auto-replies (out of office) never reopen a ticket.

**Data integrity.** Database constraints keep `closed_at`, `resolved_at` and the status consistent (implemented). `first_resolved_at` and `reopen_count` preserve metrics across reopens. The status history records the actor type (`user`, `system`, `ai`), the actor and a reason.

## Consequences

- Phase 1 must implement the transition map, the resolution field, the guard function and the actor fields; the current service still allows any transition.
- Closing without resolving remains valid and is covered by a test, so tightening it later is a deliberate change.
- Auto-reply detection becomes an acceptance criterion for inbound email.
- Billing or similar requirements can later be added as additional guard checks without changing the status model.
