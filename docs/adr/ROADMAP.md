# Architecture Decision Records

An ADR records one significant design decision: the context, the decision and its consequences. ADRs are not rewritten when a decision changes; a new ADR supersedes the old one.

| ADR                                        | Title                        | Status   |
| ------------------------------------------ | ---------------------------- | -------- |
| [0001](0001-ticket-status-lifecycle.md)    | Ticket status lifecycle      | Accepted |
| [0002](0002-attention-and-next-step.md)    | Attention flag and next step | Accepted |
| [0003](0003-background-jobs-and-worker.md) | Background jobs and worker   | Accepted |
| [0004](0004-logging-and-configuration.md)  | Logging and configuration    | Accepted |

## Template

```markdown
# NNNN. Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD

## Context

What problem or force makes a decision necessary?

## Decision

What was decided, stated precisely enough to implement and test.

## Consequences

What becomes easier or harder, and what follow-up work it creates.
```
