# LondonParking API Skeleton

This repository contains the first slice of the "London PCN Live Map + Anonymised Officer Leaderboard" stack. It exposes a Fastify-based HTTP API with strongly typed request validation, role-aware guards, and stubbed responses that mirror the target contract for the eventual PostGIS-backed implementation.

## What is included?

- **Fastify 5 + TypeScript** server configured with Helmet, CORS, and rate limiting.
- **Runtime environment validation** via [`zod`](https://github.com/colinhacks/zod) to guarantee configuration safety.
- **JWT / JWKS authentication scaffold** that enforces role-based access (`guest`, `admin`) and degrades gracefully in local development.
- **API endpoints** for tickets, leaderboards, admin ingestion triggers, health checks, and a server-sent events stream.
- **Prisma schema** that matches the target PostGIS data model for PCN tickets, patrol clusters, and ingestion watermarks.
- **Tooling**: ESLint (strict TypeScript profile), Prettier, and build scripts ready for CI.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create an environment file (e.g. `.env`) with the following variables. JWKS settings are required in production but optional for local development:

   ```bash
   NODE_ENV=development
   HOST=0.0.0.0
   PORT=3000
   # AUTH_JWKS_URL=https://your-auth-domain/.well-known/jwks.json
   # AUTH_AUDIENCE=https://your-api-audience
   # AUTH_ISSUER=https://your-auth-domain/
   ADMIN_ROLE=admin
   GUEST_ROLE=guest
   # DATABASE_URL=postgresql://postgres:postgres@localhost:5432/londonparking
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

   The API listens on `http://localhost:3000` by default.

4. Build the project for production:

   ```bash
   npm run build
   ```

5. Run linting:

   ```bash
   npm run lint
   ```

## API surface

The current implementation stubs responses but adheres to the contract defined in the technical blueprint.

| Method | Path | Description | Auth |
| ------ | ---- | ----------- | ---- |
| `GET` | `/api/healthz` | Liveness probe | none |
| `GET` | `/api/tickets?bbox=WEST,SOUTH,EAST,NORTH&since&until&limit` | Returns filtered PCN tickets | `guest` |
| `GET` | `/api/leaderboard/officers?borough&since&until` | Officer leaderboard (synthetic labels) | `guest` |
| `GET` | `/api/leaderboard/streets?borough&since&until` | Street fallback leaderboard | `guest` |
| `GET` | `/api/stream` | Server-sent events channel (heartbeats + placeholders) | `guest` |
| `POST` | `/api/admin/ingest/:source` | Trigger an ingestion job for a borough/source | `admin` |

Responses include placeholder data today; wiring to PostGIS, Redis, and worker pipelines will be layered on during subsequent phases.

## Development roadmap

- Replace fixtures with Prisma/PostGIS queries and Redis-backed streaming events.
- Add borough-specific ETL workers and BullMQ scheduling.
- Introduce automated tests (unit, contract, e2e) once the data layer is connected.
- Wire up observability (OpenTelemetry, Prometheus, Sentry) per the blueprint.

## License

This project is provided under the ISC license. See [LICENSE](LICENSE) if/when added.
