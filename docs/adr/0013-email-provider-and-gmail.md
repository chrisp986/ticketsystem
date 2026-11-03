# 0013. Email provider interface and Gmail

- Status: Accepted
- Date: 2026-11-03

## Context

Emails are stored independently of their provider (ADR 0012). The first mailbox is in Gmail, a personal account for testing for now. Other providers, such as IMAP servers or Microsoft 365, may follow, and the sync job (step 4.3) must not depend on Gmail.

## Decision

**A small provider interface.** A provider lists the messages added since a saved position, returning the new position, and fetches one message in the form `storeEmail` takes. A position the provider can no longer use leads to a listing of recent messages instead, marked as a full resync; duplicates are skipped when stored. Errors are either temporary (rate limits, server errors, network failures), so the job retries them, or a refused sign-in, which needs an operator.

**Raw messages, parsed once for all providers.** Messages are fetched as raw MIME and parsed with `mailparser`, which handles character sets, encodings and nested parts. An IMAP adapter can reuse the parser. For an email with only HTML, the parser derives the plain text, which is kept for search and AI. The `Date` header is read directly, because the parser replaces a missing or invalid one with the current time. The receive time is the provider's, never the sender's.

**Attachment IDs from the message.** An attachment's ID is its position in the message plus a checksum of its content. The raw message never changes, so the attachment can always be found again, whatever the provider does with its own attachment IDs. This settles the open point in ADR 0012.

**Gmail through its API.** The adapter calls the Gmail REST API with `fetch`, without Google's client library. Changes come from the history API, filtered to the inbox. A first sync lists the latest 100 inbox messages, taking the position before listing so nothing arriving meanwhile is missed. The receive time is Gmail's `internalDate`.

**Sign-in with a refresh token.** `pnpm gmail:authorize` runs Google's sign-in for desktop apps on a local port, with PKCE, and prints a refresh token for `.env`. The scope is `gmail.readonly`; sending replies (Phase 5) needs a wider scope and a new sign-in. The Gmail settings are separate from the server configuration, so the web app runs without them.

**No customer data in errors.** Error messages carry the HTTP status and Gmail's error reason, never Gmail's error text or message content (ADR 0004). `pnpm gmail:check` prints only counts and lengths.

## Consequences

- In "Testing" status, Google expires the refresh token after about 7 days, so a personal test mailbox needs `pnpm gmail:authorize` about weekly. A Workspace mailbox with an "Internal" project, or a verified app, avoids this before production use.
- Only messages added to the inbox are picked up. A message moved into the inbox later, for example from spam, is not, until a full resync.
- Showing an attachment means fetching the raw message again and finding the part by position and checksum.
