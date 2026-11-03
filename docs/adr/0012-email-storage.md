# 0012. Email storage

- Status: Accepted
- Date: 2026-11-01

## Context

Phase 4 brings in customer email, and Phase 5 sends replies. Providers differ, and the roadmap asks for storage that does not depend on one. Emails are untrusted input and contain personal data, and a fetched email must never be lost because of what its sender wrote.

## Decision

**One provider-neutral table.** `emails` holds inbound and later outbound messages. `provider` is text, like job types, so a new provider needs no migration, and no column is specific to one provider. An email may have no ticket until threading links it (step 4.4). An outbound email must have one.

**Two duplicate checks.** The provider and its message ID are unique, so fetching a message twice is harmless. `message_id` is unique when present, so a message delivered twice under different provider IDs is stored once. Some real emails have no Message-ID, and those do not collide. `storeEmail` returns `duplicate` and writes nothing, like `enqueueJob`.

**Metadata only.** We store the text and HTML bodies and the details of each attachment with the provider's ID, but neither the files nor the raw message. This keeps customer files out of the database until a feature needs them. A message deleted at the provider can then not be fetched or parsed again.

**What the sender controls is cleaned, not rejected.** NUL characters are removed, because Postgres cannot store them. A blank or oversized Message-ID counts as missing. Addresses are lowercased, not checked for valid syntax. Invalid provider, provider ID or mailbox values come from our own code and throw.

**Untrusted content.** Addresses, subjects and bodies never go in logs or job errors (ADR 0004). `html_body` is stored as received and must be sanitized before it is displayed. `sent_at` comes from the sender; ordering uses `received_at`.

**Keeping emails.** A ticket with emails cannot be deleted, like one with notes. Attachment details are deleted with their email.

## Consequences

- A sender can reuse an existing Message-ID on purpose, and their email is then dropped as a duplicate. Step 4.3 decides how to handle this, for example by logging the collision.
- Showing or forwarding an attachment needs a provider call, and the provider's attachment IDs must allow one (step 4.2).
- Retention of email content must be defined before production use, along with log retention.
