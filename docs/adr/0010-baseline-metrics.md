# 0010. Baseline metrics

- Status: Accepted
- Date: 2026-10-30

## Context

The roadmap's north star is agent actions and time per ticket, falling from a Phase 2 baseline, and Phase 10 is done when actions per ticket are below it. The history tables, notes and ticket timestamps already hold the data. The definitions must stay stable, or later numbers cannot be compared with the baseline. The system has no real tickets yet, so a baseline recorded today would mean nothing.

## Decision

**Tickets measured.** Metrics cover tickets closed in a period, the start included and the end excluded. Dates are in Berlin time, like the rest of the UI.

**One action is one distinct combination of ticket, user and timestamp.** One change can write several rows (status, assignment, attention, note), all with the same timestamp, and it is still one action. Creating a ticket is an action.

- Only people count. Changes by the system and AI do not, because the goal is less work for people; automation lowers the number without changing the definition.
- Only actions up to and including the closing count. Notes can be added to closed tickets (ADR 0005), and a recorded number must not grow later.

**Metrics.**

| Metric               | Definition                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------- |
| Actions per ticket   | Median and average, the north star                                                            |
| Time to first action | Median and average, from creation to the first later action                                   |
| Time to resolution   | Median and average, from creation to `first_resolved_at`; never-resolved tickets are left out |
| Time to close        | Median and average, from creation to `closed_at`                                              |
| Reopen rate          | Share of tickets with `reopen_count` above zero                                               |
| Overdue next steps   | Share of open tickets overdue when the report runs; not limited to the period                 |

**"Time per ticket" means elapsed time.** The system does not record how long an agent works on a ticket, and a timer would itself be agent work. Working time is not measured.

**A report, not a table.** `pnpm metrics:report --from --to` computes the metrics from the existing tables and prints Markdown. Nothing is stored in the database.

**The baseline is recorded after real use**, at about 30 closed tickets, as a dated file in `docs/metrics/` with the numbers, the period and the ticket count.

## Consequences

- Phase 2 stays open until the baseline is recorded. Phase 3 does not depend on it and can start.
- A service that writes one change with several timestamps would count as several actions. Every service therefore uses one timestamp per change, and a test covers this.
- Tickets created before ADR 0009 took `created_at` from the database, not from the service, so their creation counts as two actions. They are test data and fall outside the baseline period.
- A metrics page for admins comes later and needs an admin role, which does not exist yet (backlog).
