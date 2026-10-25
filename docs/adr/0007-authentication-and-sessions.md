# 0007. Authentication and sessions

- Status: Accepted
- Date: 2026-10-25
- Amended: 2026-10-25 (actor IDs, see Consequences)

## Context

Every change is attributed to an actor (ADR 0001), notes need an author (ADR 0005), and next steps need an owner (ADR 0002). Today all changes are made by an anonymous `user`. The app listens on the local network, so anyone who can reach it can change tickets. The system must run on the target hardware without an external identity provider.

## Decision

**Email and password.** Agents sign in with an email address and a password. Passwords are hashed with Argon2id (`@node-rs/argon2`, 19 MiB memory, 2 iterations, parallelism 1) and must be 12 to 256 characters long. Email addresses are stored in lower case and are unique.

**No sign-up.** Accounts are created from the terminal with `pnpm user:create`. There is one role: every user is an agent. A user can be deactivated with the `active` flag; an inactive user cannot sign in, and existing sessions stop working.

**Sessions in the database.** Signing in creates a random 32-byte token. The browser keeps the token in an `HttpOnly`, `SameSite=Lax` cookie, `Secure` when the request uses HTTPS. The database stores only the SHA-256 hash of the token, so a leaked `sessions` table cannot be used to sign in. A session lasts 30 days and is extended to 30 days again when it is used with less than 15 days left. Signing out deletes the session.

**Everything requires sign-in** except `/login` and `/health/*`. Unauthenticated requests are redirected to `/login`, which returns to the original local path afterwards. SvelteKit's origin check protects form actions against cross-site requests.

**One error for every failed login.** Unknown email, wrong password and inactive user show the same message. For an unknown email the password is still verified against a dummy hash, so response time does not reveal which addresses exist.

**Logging.** Sign-ins and sign-outs are logged with the user ID. Email addresses, passwords and tokens are never logged (ADR 0004).

## Consequences

- The signed-in user is recorded as the actor of every change. _Amendment (2026-10-25): this said actor IDs stay empty until step 2.3; the ticket forms pass the user since ADR 0008, and ADR 0009 defines actors._
- Failed logins are not rate-limited yet. That must be added before the app is reachable from outside the local network.
- Password reset and deactivation have no UI or script yet; they are done with SQL until a later step adds them.
- Modules used by scripts and the future worker must not import SvelteKit modules (ADR 0003). The database is created by a framework-neutral `createDb` factory.
