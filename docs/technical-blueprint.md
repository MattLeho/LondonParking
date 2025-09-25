# Unified Technical Blueprint — "London PCN Live Map + Anonymised Officer Leaderboard"

## 1. Product Design Requirements (PDR)

### Vision
A desktop web application that displays London Penalty Charge Notices (PCNs) on a live map alongside a leaderboard of anonymised "Parking Officer N" labels derived from spatiotemporal clustering, all without personally identifiable information.

### Target Users
* Residents
* Journalists
* Researchers
* Civic-tech practitioners
* Urban-planning cohorts

### Core Features
* Live map of recently published PCNs with clustering and a time window slider.
* Ticket popover with timestamp, street, contravention, spatial-accuracy tag, and estimated fine range.
* Streaming updates as soon as data portals publish new information.
* Leaderboard of **synthetic** officers per borough and London-wide ("Parking Officer 1, 2, …").
* Borough coverage limited to those with any stations in Transport for London Zones 1–3; City of London excluded:
  Barnet; Brent; Bromley; Camden; Croydon; Ealing; Greenwich; Hackney; Hammersmith and Fulham; Haringey; Hounslow; Islington; Kensington and Chelsea; Lambeth; Lewisham; Merton; Newham; Richmond upon Thames; Southwark; Tower Hamlets; Waltham Forest; Wandsworth; Westminster. Note that fare zones apply to stations, not whole-borough coverage.

### Functional Requirements
* ETL per borough (API or CSV) with watermarking and idempotent deduplication by `(pcn_id, source)`.
* PostGIS storage with viewport (bounding box + time) queries and server-side clustering when needed.
* SSE push channel broadcasting newly ingested tickets and patrol updates.
* Officer pseudonymisation using daily rotating, non-linkable sequence labels.
* Leaderboards by synthetic officer with fallback by street when clustering is ambiguous.
* Source attribution and licence badges in the UI.
* Public, read-only UI with admin-only ETL controls.

### Non-functional Requirements
* Availability ≥ 99.5%.
* P95 ≤ 250 ms for viewport queries returning ≤ 5,000 rows.
* GDPR-safe by design; pseudonyms reset daily with no cross-day linkage.
* WCAG 2.1 AA compliance.
* Security checklist enforced across the stack.

### Problem Solved
Unifies fragmented borough data into a single, playful, privacy-preserving visualisation that is both useful and lawful.

## 2. Tech Stack

### Frontend
* React 18 + TypeScript + Vite for fast builds and strict typing.
* Leaflet with `leaflet.markercluster` for mapping using an OSM or Google basemap.
* TanStack Query for server-state caching and SSE hydration.
* Zustand for minimal UI state (filters, viewport).
* Tailwind CSS + Headless UI for accessible, consistent components.

### Backend
* Node.js 20 + Fastify for high-throughput HTTP and schema validation.
* PostgreSQL 16 + PostGIS 3 for spatial indexes, bounding-box queries, and clustering support.
* Prisma ORM for type-safe database access; raw SQL only for tuned spatial queries.
* Redis 7 + BullMQ for ETL scheduling, retries/backoff, and pub/sub fan-out.
* Server-Sent Events (SSE) over HTTP/2 for near-real-time updates.
* Auth via Clerk or Auth0, providing sessions, MFA, and RBAC.
* Hosting on Vercel (frontend) and AWS or Fly.io (API), with managed Postgres (RDS or Supabase).
* Observability through OpenTelemetry, Prometheus/Grafana, and Sentry error tracking.

### Rationale
PostGIS provides efficient geospatial filtering at scale, SSE delivers near-real-time updates without the complexity of WebSockets, managed auth avoids bespoke security solutions, and Vite/React/Tailwind support a focused desktop UI.

## 3. App Flowchart

```
[Browser]
  │  Load React app + tiles
  ├───────────────► GET /api/tickets?bbox&since&until&limit
  │                 ▲
  │                 │ JSON rows from Postgres/PostGIS (bbox + time filter)
  │
  ├───────────────► OPEN SSE /api/stream
  │                 ▲
  │                 │ Redis pub/sub fan-out of new tickets + patrol updates
  │
  └─ UI filters/viewport → local state → re-query tickets

[Fastify API]
  ├─ tickets, leaderboard, patrols, healthz (read-only)
  └─ admin/ingest/* (RBAC: admin)

[Postgres + PostGIS]
  ├─ pcn_ticket (geom, issued_at, metadata)
  └─ patrol (daily synthetic sequences)

[ETL Workers: BullMQ]
  ├─ Poll API (e.g., Camden) every 60–120 s with watermark
  ├─ Fetch CSV/portal exports on schedules per borough
  ├─ Normalise, validate, dedupe, bulk insert
  └─ Patrol job (60 s): cluster by ≤150 m and ≤12 min gap → salted label
```

## 4. Project Rules

### Coding
* TypeScript `strict: true` with ESLint and Prettier.
* Use module path aliases.
* Apply `zod` runtime validation on every API boundary.
* Use prepared statements only; hand-tuned spatial SQL reviewed separately.
* No inline secrets; configuration via environment variables only.

### Version Control
* Trunk-based development with short-lived feature branches using Conventional Commits.
* Protected `main` branch with CI gates for build, lint, unit, API, E2E, and security scans.
* `semantic-release` for automated versioning and changelog generation.

### Testing
* Unit: Vitest/Jest for grouping, pricing, and transforms.
* API: Supertest + OpenAPI contract tests.
* Database: Testcontainers for Postgres + PostGIS.
* End-to-end: Playwright for viewport fetch, SSE, and leaderboard flows.
* Load: k6 targeting `/api/tickets` and SSE broadcast paths.
* Security: dependency audit and auth/RBAC tests.

### Documentation & Reviews
* `/docs` contains architecture details, DPIA, borough data notes, runbooks, and ADRs.
* Pull request template includes scope, risk, performance impact, and security checklist mapping.

### Performance & Accessibility
* Database: GIST on `geom`, B-tree on `issued_at`, partial index for last 30 days.
* API: Clamp bounding-box area and result limits; Redis cache for hot leaderboards (TTL 60 s).
* UI: Virtualised lists, 150 ms debounced viewport updates, and code-split heavy layers.
* WCAG AA compliance with keyboard accessibility, focus management, and sufficient contrast.

## 5. Implementation Plan

### Phase 0 — Foundations (Week 1)
* Create repositories, CI/CD pipelines, and environment scaffolding.
* Scaffold Fastify, Prisma migrations for `pcn_ticket`, `patrol`, and `ingest_watermark` tables.
* Integrate Clerk/Auth0 with `guest` (viewer) and `admin` (ETL) roles.
* Implement SSE endpoint with heartbeat, global rate limiter, strict CORS, and sanitised errors.
* Establish observability baseline with OpenTelemetry, Prometheus/Grafana, and Sentry.

### Phase 1 — Camden + Map MVP (Weeks 2–3)
* Build Camden SODA poller with `$order` and watermark; dedupe on `(pcn_id, source)`.
* Implement viewport API `GET /api/tickets?bbox&since&until&limit`.
* Develop React map with clustering, time slider, and popovers.
* Integrate SSE to inject new markers with “recent” styling.
* Provide street leaderboard fallback while officer clustering is validated.

### Phase 2 — Patrols + Officer Leaderboard (Week 4)
* Implement spatiotemporal grouping with thresholds of ≤150 m distance and ≤12 min gap.
* Generate daily salts, one-day scope, and non-linkable labels.
* Expose `GET /api/leaderboard/officers?borough&since&until`.
* Build leaderboard UI for borough and London-wide views.

### Phase 3 — Borough Roll-up (Weeks 5–6)
* Add ETL modules for the Zones 1–3 borough list.
  * Tier A: transactional APIs → poll every 60–120 s.
  * Tier B: CSV/JSON exports → schedule hourly/daily.
  * Tier C: dashboard-only → mark “no granular points yet” (excluded from officer leaderboard until point data appears).
  * TfL red-route summaries provide context only unless point-level data is acquired.
* Implement data-quality checks and ingestion-lag metrics per source.

### Phase 4 — Hardening (Week 7)
* Tune load: indexes, partials, query plans, Redis caches.
* Harden failure handling with retries/backoff, DLQ, and circuit breakers.
* Conduct security review against the checklist, penetration testing, and DPIA review.

### Dependencies
Managed Postgres + PostGIS, Redis, authentication provider credentials, and borough data licences.

## 6. Frontend Guidelines

### Design
* Desktop-first layout with maximised map viewport and persistent sidebar containing **Map** and **Leaderboard** tabs.
* Minimal palette with recency/accuracy badges.
* WCAG AA compliance and full keyboard support.

### Architecture
* Feature folders: `map/`, `leaderboard/`, `filters/`, `auth/`.
* Server state via TanStack Query (GET + SSE hydration).
* UI state via Zustand (filters, viewport).
* Hooks:
  * `useViewport()` — bounds + debounced changes.
  * `useTickets(bbox, time)` — fetch and apply SSE deltas.
  * `usePatrols(borough, time)` — fetch and apply SSE deltas.

### Styling
* Tailwind utilities with CSS variables for theme.
* Leverage Headless UI patterns; avoid inline styles.

### Performance
* Virtualise lists with `react-virtual`.
* Avoid re-creating Leaflet instances; use refs for imperative layer updates.
* Memoise computed layers and handlers with `useMemo` and `useCallback`.
* Code-split heavy layers (e.g., heatmap) and offload non-critical chunks.

## 7. Backend Guidelines

### Read-only API Surface
* `GET /api/tickets?bbox=WEST,SOUTH,EAST,NORTH&since&until&limit=5000`
* `GET /api/leaderboard/officers?borough&since&until`
* `GET /api/leaderboard/streets?borough&since&until`
* `GET /api/stream` (SSE: `ticket`, `patrol`, `leaderboard`)
* `GET /api/healthz`
* Admin: `POST /api/admin/ingest/{source}` (RBAC: admin)

### Database Schema (Postgres + PostGIS)
```sql
create table pcn_ticket (
  id text primary key,
  source text not null,
  borough text not null,
  issued_at timestamptz not null,
  code text,
  desc text,
  level text,      -- 'higher'|'lower'|null
  band text,       -- 'A'|'B'|null (if derivable)
  est_min_p int,   -- pennies
  est_max_p int,   -- pennies
  street text,
  accuracy text,
  geom geography(Point,4326),
  created_at timestamptz default now()
);
create index on pcn_ticket using gist (geom);
create index on pcn_ticket (issued_at);
create index pcn_recent_idx on pcn_ticket(issued_at) where issued_at > now() - interval '30 days';

create table patrol (
  id uuid primary key,
  label text not null,   -- "Parking Officer NN"
  day date not null,
  borough text not null,
  first_seen timestamptz not null,
  last_seen timestamptz not null,
  tickets int not null,
  est_min_p int not null,
  est_max_p int not null,
  centroid geography(Point,4326)
);

create table ingest_watermark (
  source text primary key,
  last_issued_at timestamptz,
  last_seen_at timestamptz not null default now()
);
```

### Officer Pseudonymisation
* Sort tickets by `issued_at` within each borough.
* Start a new sequence when the distance from the previous ticket exceeds 150 m or the time gap exceeds 12 minutes.
* For each sequence per day:
  * Compute a salted hash of `(day, borough, sequence_id, daily_salt)` to map deterministically to a short code rendered as "Parking Officer N" in rank order.
  * Aggregate `tickets`, `est_min_p`, `est_max_p`, and `centroid`.
* Reset all mappings nightly with no persistence of cross-day joins for privacy.

### ETL Tiers per Borough (Zones 1–3 List)
* Tier A: transactional API (poll every 60–120 s).
* Tier B: downloadable CSV/JSON (hourly/daily).
* Tier C: dashboard-only (mark unavailable for point-level; exclude from officer leaderboard until point data appears).
* Tier D: report-only (use for context totals; not plotted).
* All ingests use schema normalisers, watermarks, deduplication, bulk inserts, and publish to Redis/SSE.

### Performance
* Apply guardrails: maximum bounding-box area, row cap of 5,000, and time-window clamps.
* Return latitude/longitude floats (no WKB); use gzip for compact JSON.
* Redis cache for hot leaderboards (TTL 60 s).
* Use bulk COPY for CSVs with unlogged staging tables followed by validated merge.
* Partition `pcn_ticket` by month at scale.

### Security
* Fastify `preHandler` validates JWT and role before protected routes, with rate limiting and input clamps.
* Provide sanitised errors with structured logs and Sentry integration; avoid exposing stack traces to clients.
* Employ least-privilege database users (`api_readonly`, `etl_writer`) with credential rotation.
* Enforce HTTPS with HSTS and secure cookies (`Secure; HttpOnly; SameSite=Lax`).

## 8. Optimised React Code Guidelines

### Principles
Keep components pure and small; co-locate state; memoise heavy computations; avoid unstable props.

### Common Pitfalls and Fixes

**Inline handlers or objects**
```tsx
// Bad
<Marker onClick={() => setOpen(id)} style={{ zIndex: 10 }} />

// Good
const onClick = useCallback(() => setOpen(id), [id]);
<Marker onClick={onClick} className="z-10" />
```

**Expensive compute during render**
```tsx
// Bad
const clusters = cluster(points);

// Good
const clusters = useMemo(() => cluster(points), [points]);
```

**Context churn**
```tsx
// Bad
<FiltersContext.Provider value={{filters, setFilters}} />

// Good
const ctx = useMemo(() => ({filters, setFilters}), [filters]);
<FiltersContext.Provider value={ctx} />
```

**Virtualised lists**
```tsx
const Row = React.memo(({t}: {t: Ticket}) => /* ... */);
<Virtualizer
  count={tickets.length}
  estimateSize={() => 36}
  children={(index) => <Row t={tickets[index]} />}
/>
```

### Component Structure
* `MapCanvas` (Leaflet instance; imperative updates via refs).
* `MapController` (fetch/SSE, marker diffing).
* `LeaderboardPanel` (memoised rows; paginated).
* `FiltersPanel` (controlled inputs; debounced updates).
* Presentational components wrapped in `React.memo`.

## 9. Security Checklist (Must Enforce)
1. **Battle-tested auth** — Clerk/Auth0; no custom auth; sessions/MFA; key rotation.
2. **Protected endpoints locked down** — `/api/admin/*` requires JWT + RBAC; global rate limiting; bounding-box/row clamps.
3. **No frontend secrets** — only non-sensitive `VITE_*` values exposed; DB/API keys remain server-side environment variables.
4. **Git-ignore sensitive files** — `.env*`, `*.pem`, dumps, local volumes; pre-commit leak checks.
5. **Sanitised errors** — friendly client messages; stack traces server-only; Sentry redaction.
6. **Middleware auth checks** — Fastify `preHandler` validates JWT and role before protected routes.
7. **RBAC** — `guest` (view-only), `admin` (ETL/ops); central policy with tests.
8. **Secure DB libraries/platforms** — Prisma; RLS if Supabase; least-privilege users; parameterised queries.
9. **Secure hosting** — Vercel + AWS/Fly.io with TLS, WAF/DDoS, auto-patching, backups.
10. **HTTPS everywhere** — HSTS; HTTP→HTTPS redirect; `Secure; HttpOnly; SameSite` cookies.
11. **File-upload limits** — none in scope; if added later, enforce AV scan, MIME allow-list, size caps, and signed URLs.

---

