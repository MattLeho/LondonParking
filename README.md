# LondonParking API Platform

This repository implements the backend services for the "London PCN Live Map + Anonymised Officer Leaderboard" experience. It
combines a Fastify HTTP server, Prisma/PostgreSQL access layer, BullMQ-powered ETL workers, and a server-sent events fan-out to
serve live parking ticket activity across participating London boroughs.

## What is included?

- **Fastify 5 + TypeScript** HTTP server with Helmet, CORS, sensible defaults, and per-route rate limiting.
- **Runtime environment validation** via [`zod`](https://github.com/colinhacks/zod) covering auth, database, Redis, and
  observability configuration.
- **JWT / JWKS authentication guard** enforcing `guest` and `admin` RBAC roles while providing a permissive fallback for
  anonymous development.
- **PostGIS-ready Prisma layer** with ticket, patrol, and ingestion watermark models, plus raw spatial queries for viewport
  filtering and spatiotemporal clustering.
- **Officer leaderboard sequencing** that groups tickets by ≤150 m proximity and ≤12 minute windows, applying deterministic daily
  salts for privacy-preserving "Parking Officer N" labelling.
- **Redis + BullMQ ingestion pipeline** (Camden fixture source provided) together with an admin trigger endpoint and worker
  process entry point.
- **Server-sent events broadcaster** for ticket, leaderboard, patrol, and heartbeat updates with subscription helpers.
- **Tooling**: ESLint (strict TypeScript), Prettier, Prisma generator, and TypeScript build scripts ready for CI usage.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Provision services:

   - PostgreSQL 16 with PostGIS 3 extension enabled.
   - Redis 7 for BullMQ job queueing and pub/sub fan-out.

3. Create an environment file (e.g. `.env`) with the following variables. JWKS settings are required in production but optional
   for local development:

   ```bash
   NODE_ENV=development
   HOST=0.0.0.0
   PORT=3000
   # AUTH_JWKS_URL=https://your-auth-domain/.well-known/jwks.json
   # AUTH_AUDIENCE=https://your-api-audience
   # AUTH_ISSUER=https://your-auth-domain/
   ADMIN_ROLE=admin
   GUEST_ROLE=guest
   LEADERBOARD_DAILY_SECRET=change-me-daily
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/londonparking
   REDIS_URL=redis://localhost:6379
   ```

4. Generate the Prisma client after adjusting the schema (run automatically by `npm run prisma`):

   ```bash
   npm run prisma
   ```

5. Start the development API server:

   ```bash
   npm run dev
   ```

6. In a second terminal start the ingestion worker (requires Redis):

   ```bash
   npm run dev:worker
   ```

7. Run the lint and build pipelines:

   ```bash
   npm run lint
   npm run build
   ```

## API surface

The server currently exposes the read-only contract described in the technical blueprint. Tickets and leaderboard responses are
backed by SQL queries and anonymisation routines, while the Camden ETL worker hydrates a set of fixture tickets to demonstrate the
end-to-end flow.

| Method | Path | Description | Auth |
| ------ | ---- | ----------- | ---- |
| `GET` | `/api/healthz` | Liveness probe | none |
| `GET` | `/api/tickets?bbox=WEST,SOUTH,EAST,NORTH&since&until&limit` | Viewport-filtered PCN tickets (PostGIS spatial query) | `guest` |
| `GET` | `/api/leaderboard/officers?borough&since&until` | Officer leaderboard (daily salted spatiotemporal sequences) | `guest` |
| `GET` | `/api/leaderboard/streets?borough&since&until` | Street-level fallback leaderboard | `guest` |
| `GET` | `/api/stream` | Server-sent events channel (ticket, leaderboard, patrol, heartbeat) | `guest` |
| `POST` | `/api/admin/ingest/:source` | Enqueue an ETL ingestion job via BullMQ | `admin` |

## Data flow highlights

- `src/services/tickets.ts` issues raw SQL against `pcn_ticket` using `ST_MakeEnvelope` bounding boxes and temporal filters.
- `src/services/leaderboard.ts` groups tickets into patrol sequences using haversine distance and time thresholds, hashes the
  grouping with a daily secret, and emits ranked officer labels plus street aggregates.
- `src/etl/workers/sources/camden.ts` seeds the database with fixture Camden tickets and updates ingestion watermarks. Additional
  boroughs can be added by extending the `sources` map in `src/etl/workers/index.ts`.
- `src/lib/events.ts` and `src/http/routes/stream.ts` implement the SSE dispatcher and subscription lifecycle.

## Background workers

- `npm run worker` starts a BullMQ worker in production mode, processing ingestion jobs and emitting SSE notifications when new
  tickets arrive.
- Workers require `REDIS_URL` to be defined; the process exits early with a helpful error when Redis is absent.

## Development roadmap

- Replace the Camden fixtures with real borough ETL integrations and extend the `sources` catalogue.
- Publish patrol events and derived leaderboard deltas through the SSE channel and an eventual Redis pub/sub fan-out.
- Add automated tests (unit, contract, e2e) once Postgres/Redis Testcontainers are wired into the toolchain.
- Wire up observability (OpenTelemetry, Prometheus, Sentry) per the blueprint.

## License

This project is provided under the ISC license. See [LICENSE](LICENSE) if/when added.
