# 0004. Logging and configuration

- Status: Accepted
- Date: 2026-10-04

## Context

Errors were swallowed without a trace, configuration was read in three inconsistent ways, and error objects from the database layer carried user content (query parameters) and large internal objects.

## Decision

**Structured logs.** One JSON line per event with level, time, message and context. `warn` and `error` go to stderr.

**Request IDs.** Every request gets a generated ID, exposed on `event.locals` and the `x-request-id` header and included in every related log line. Unexpected errors show only a generic message and the request ID to the user.

**No user content in logs.** Error serialization keeps only primitive fields (for example `code` and `constraint`), drops attached objects, and removes query parameters from database error messages and stacks. Ticket subjects and descriptions are never logged.

**Validated configuration.** A framework-neutral Zod schema (`config.ts`) parses any environment object; `env.ts` binds it to SvelteKit. Invalid configuration fails at startup and names the fields without printing their values.

**Health endpoints.** `/health/live` for the process, `/health/ready` for database reachability. Health requests log at debug level.

## Consequences

- Any code that catches an error must log it where it is caught; errors caught in form actions never reach the central handler.
- Log retention and access must be defined before production use.
