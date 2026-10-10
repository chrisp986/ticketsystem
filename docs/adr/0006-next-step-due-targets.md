# 0006. Next-step due targets

- Status: Accepted
- Date: 2026-10-10

## Context

ADR 0002 requires every open ticket to have a next step with a due date. Agents should rarely type a date, so the system needs sensible defaults that reflect urgency.

## Decision

**Due dates are counted in business time:** Monday to Friday, 08:00 to 17:00, Europe/Berlin. One working day is 9 business hours. Public holidays are not modelled yet.

**Default targets:**

| Status             | Target                                                                |
| ------------------ | --------------------------------------------------------------------- |
| `new`              | 1 hour (first response)                                               |
| `in_progress`      | by priority: critical 2 h, high 4 h, medium 1 working day, low 2 days |
| `waiting_customer` | 3 working days                                                        |
| `waiting_internal` | 2 working days                                                        |
| `resolved`         | 5 working days                                                        |
| `closed`           | none                                                                  |

Defaults pre-fill the form; the agent can always change the date. The targets live in one module so they can be replaced by configuration.

## Consequences

- Later phases make targets configurable and specific to ticket types, and may add extended hours and public holidays.
- A ticket created on Friday afternoon is due on Monday morning, which matches staffed hours but not 24/7 support.
