# AI-First Ticketsystem

An email-based ticket system in which AI analyzes, summarizes and classifies incoming requests and proposes actions or replies, while humans keep control over every operational decision and every message to a customer.

**Less managing. More resolving.**

The project is also a practical environment for learning TypeScript and full-stack development.

## Status

Phase 0 (Foundation) is nearly complete. Working today:

- Ticket creation, listing, filtering, search and status changes
- Optimistic concurrency control and a status history
- Database constraints that keep lifecycle timestamps consistent
- Structured JSON logging with request IDs and central error handling
- Validated server configuration
- Health endpoints
- CI running type checks, lint, unit tests, integration tests and the build

Email, authentication, AI processing and human review are not implemented yet. See the [roadmap](docs/roadmap.md).

## Technology

| Component   | Technology                               |
| ----------- | ---------------------------------------- |
| Application | SvelteKit 2, Svelte 5, TypeScript        |
| Database    | PostgreSQL 18 with Drizzle ORM           |
| Validation  | Zod                                      |
| Testing     | Vitest (unit and PostgreSQL integration) |
| Runtime     | Node.js 22 via `@sveltejs/adapter-node`  |
| Planned     | Gmail, Ollama, pgvector                  |

Architecture: a modular monolith with server-side services, a persistent PostgreSQL job queue and a separate worker process (planned). See the [architecture decision records](docs/adr/README.md).

## Prerequisites

- Node.js 22 or newer
- pnpm
- Docker with Docker Compose

## Getting started

```sh
pnpm install
cp .env.example .env          # then fill in real values
docker compose up -d          # development database on 127.0.0.1:5432
pnpm db:migrate
pnpm dev                      # http://localhost:5173
```

## Configuration

| Variable                                        | Required | Purpose                                                      |
| ----------------------------------------------- | -------- | ------------------------------------------------------------ |
| `DATABASE_URL`                                  | yes      | PostgreSQL connection URL (`postgres://` or `postgresql://`) |
| `LOG_LEVEL`                                     | no       | `debug`, `info` (default), `warn` or `error`                 |
| `POSTGRES_PASSWORD`                             | yes      | Password for the development database container              |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PORT` | no       | Overrides for the development database container             |
| `TEST_DATABASE_URL`                             | no       | Test database URL; the database name must end in `_test`     |

The server validates its configuration at startup and names invalid fields without printing their values.

## Testing

Unit tests need no database:

```sh
pnpm test
```

Integration tests run against a separate test database on `127.0.0.1:5433`. It lives in memory (`tmpfs`), so it starts empty every time the container is created and must be migrated:

```sh
docker compose -f docker-compose.test.yml up -d --wait
pnpm db:test:migrate
pnpm test:integration
```

Before pushing, run the same checks as CI:

```sh
pnpm validate
```

## Scripts

| Script                  | Purpose                                      |
| ----------------------- | -------------------------------------------- |
| `pnpm dev`              | Development server                           |
| `pnpm build`            | Production build into `build/`               |
| `pnpm start`            | Run the production build, loading `.env`     |
| `pnpm check`            | Svelte and TypeScript checks                 |
| `pnpm lint`             | Prettier check and ESLint                    |
| `pnpm format`           | Format all files with Prettier               |
| `pnpm test`             | Unit tests                                   |
| `pnpm test:integration` | Integration tests against the test database  |
| `pnpm validate`         | All of the above, as run in CI               |
| `pnpm db:generate`      | Generate a migration from schema changes     |
| `pnpm db:migrate`       | Apply migrations to the development database |
| `pnpm db:test:migrate`  | Apply migrations to the test database        |

## Running in production mode

```sh
pnpm build
pnpm start                    # http://localhost:3000
```

`adapter-node` reads `PORT` and `HOST`. Behind a reverse proxy, also set `ORIGIN` to the public URL.

Health endpoints:

- `GET /health/live` returns 200 while the process runs.
- `GET /health/ready` returns 200 when the database is reachable, otherwise 503.

## Network exposure

The development server listens on `0.0.0.0` so the app can be opened from other machines on the local network. Both database containers bind to `127.0.0.1` only and are not reachable from the network.

## Project structure

```
src/
  hooks.server.ts         request IDs, request logging, error handling
  lib/modules/tickets/    ticket constants, types and validation (shared)
  lib/server/             server-only code
    config.ts             framework-neutral configuration schema
    env.ts                SvelteKit binding for the configuration
    logger.ts             structured JSON logger
    db/                   database client and Drizzle schema
    tickets/              ticket services
  routes/                 pages, form actions and health endpoints
tests/integration/        integration tests against PostgreSQL
drizzle/                  generated SQL migrations
docs/                     roadmap and architecture decision records
```

## Development workflow

- One branch per roadmap step, merged through a pull request once CI is green.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).
- Database changes go through `pnpm db:generate`; read the generated SQL before applying it.
- Significant design decisions are recorded as ADRs in `docs/adr/`.
