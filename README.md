# scsm-search

A read-only HTTP search API over the **Microsoft System Center Service Manager (SCSM)** data warehouse. It searches **tickets** (Incidents and Service Requests) and **domain users** from the `CiresonAnalytics` database and the `ServiceManager` warehouse user view, and exposes them through a small, fast, API-key-protected REST service.

It exists because SCSM's native search is slow and imprecise. This service queries SQL Server directly with proper indexes (optionally SQL Server Full-Text Search) and gives consumers — dashboards, bots, or any internal tool — a clean JSON interface without ever touching the live SCSM OLTP database.

> **Related project:** [PCM Compass](https://github.com/giiftmor/pcm_printer_search) consumes this API from its `/scsm-search` page. See [Related projects](#related-projects) below.

---

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [API reference](#api-reference)
  - [Authentication](#authentication)
  - [Endpoints](#endpoints)
  - [Response shape](#response-shape)
  - [Errors](#errors)
  - [Pagination](#pagination)
- [Search modes](#search-modes)
- [Configuration](#configuration)
- [Local development](#local-development)
- [Deployment (Docker)](#deployment-docker)
- [Testing](#testing)
- [Smoke test](#smoke-test)
- [Project structure](#project-structure)
- [Data sources](#data-sources)
- [Security](#security)
- [Related projects](#related-projects)

---

## Features

- **Ticket search** across Incidents and Service Requests with filters: free-text `q` (matches `WorkItemId`, title, description, tier, and location), `status`, `priority` (Service Requests only), `tier`, `location`, affected/created-by/assigned user IDs, and a `from`/`to` created-date range.
- **Relevance ranking** — results sort by relevance by default (phrase and title matches rank highest), with `newest` and `az` alternatives.
- **Filter metadata** — `GET /v1/meta/filters` returns the distinct tiers and statuses to power filter dropdowns.
- **User search** over the SCSM `DomainUser` warehouse view by name, user ID, or UPN.
- **User ticket pivot** — `GET /v1/users/:id/tickets` returns all of a person's tickets, filtering by their role on the ticket (`affected`, `created_by`, or `assigned`). The `:id` resolves by **GUID, username, or UPN**.
- **Two search backends**, selectable at startup: SQL Server Full-Text Search (`SEARCH_MODE=fts`) or `LIKE` fallback (`SEARCH_MODE=like`).
- **API-key authentication** with constant-time comparison; multiple keys supported, one per consumer.
- Read-only by design — no write endpoints, parameterized queries only.

---

## Architecture

```
                 ┌──────────────────────────────┐
                 │  SQL Server (CiresonAnalytics │
                 │  + ServiceManager view)       │
                 │  Incidents / ServiceRequests  │
                 │  / DomainUser                 │
                 └──────────────┬───────────────┘
                                │ mssql connection pool
                                ▼
                 ┌──────────────────────────────┐
                 │       scsm-search API        │
                 │       (Node.js / Express)    │
                 │                              │
                 │   /v1/search/tickets          │
                 │   /v1/search/users            │
                 │   /v1/meta/filters            │
                 │   /v1/users/:id/tickets       │
                 └──────────────┬───────────────┘
                                │ HTTP/JSON (x-api-key)
                 ┌──────────────┴───────────────┐
                 ▼                              ▼
        ┌──────────────────┐          ┌──────────────────┐
        │   PCM Compass     │          │   n8n / other     │
        │   /scsm-search    │          │   HTTP consumers  │
        │   (Flask proxy)   │          │   (bots, jobs)    │
        └──────────────────┘          └──────────────────┘
```

The API is the single point of contact for SCSM warehouse data. Consumers never talk to SQL Server directly.

---

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript 5.9 (strict, ESM) | `"type": "module"`, `NodeNext` resolution |
| Runtime | Node.js ≥ 22 | Docker image runs `node:24-alpine` |
| Web framework | Express 5 | |
| DB driver | `mssql` 11 | SQL Server via Tedious |
| Validation | `zod` 3 | Query params parsed/validated on every request |
| Logging | `pino` + `pino-http` | `x-api-key` request header redacted from logs |
| Tests | `node:test` + `supertest` | No jest/vitest |

---

## API reference

### Authentication

All `/v1/*` routes require an `x-api-key` header whose value is one of the comma-separated keys in `API_KEYS`. `GET /healthz` is unauthenticated. Requests without a valid key receive:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "..." } }
```

### Endpoints

#### `GET /healthz` — liveness + DB probe

Unauthenticated. Runs `SELECT 1` against the pool. `200 {"status":"ok"}` on success, `503` if the DB is unreachable.

#### `GET /v1/search/tickets`

Search tickets of one type.

| Param | Type | Required | Notes |
|---|---|---|---|
| `type` | `incident` \| `servicerequest` | **yes** | Determines the source table |
| `q` | string | no | Free text; matches `WorkItemId` (LIKE) and title/description (CONTAINS in `fts` mode, LIKE in `like` mode). Max 200 chars |
| `status` | string | no | Exact match, max 100 chars |
| `priority` | string | no | Service Requests only (Incidents have no priority column) |
| `tier` | string | no | Exact match on the support tier, max 100 chars |
| `location` | string | no | Substring match (LIKE, escaped), max 200 chars |
| `sort` | `relevance` \| `newest` \| `az` | no | Result ordering; default `relevance` |
| `affectedUserId` | string | no | Filter by the affected user's GUID |
| `createdByUserId` | string | no | Filter by the creator's GUID |
| `assignedUserId` | string | no | Filter by the assignee's GUID |
| `from` / `to` | ISO date | no | Filters `CreatedDate` range |
| `page` | int ≥ 1 | no | Default `1` |
| `pageSize` | int 1–100 | no | Default `25` |

#### `GET /v1/search/users`

Search domain users. Params: `q` (matches display name / user ID / UPN, max 200 chars), `page`, `pageSize`. Returns `{ id, userId, displayName, upn }` per result.

#### `GET /v1/meta/filters`

Distinct filter values for building dropdowns, aggregated across Incidents and Service Requests (nulls excluded, sorted A–Z):

```json
{
  "tiers": ["Operations", "Potch Staff Service Desk"],
  "statuses": ["Active", "Closed", "Resolved"]
}
```

No query parameters. API-key protected like every other `/v1/*` route.

#### `GET /v1/users/:id/tickets`

All tickets for one person, merged across Incidents and Service Requests with a `ticketType` discriminator.

| Param | Type | Required | Notes |
|---|---|---|---|
| `:id` | string | **yes** | Resolves by **GUID, username, or UPN** |
| `role` | `affected` \| `created_by` \| `assigned` | no | Default `affected` |
| `page` / `pageSize` | int | no | As above |

Errors:
- `404 NOT_FOUND` — no user matches `:id`
- `400 AMBIGUOUS` — `:id` matches more than one user

### Response shape

All search endpoints return the same envelope:

```json
{ "results": [...], "page": 1, "pageSize": 25, "total": 134 }
```

**Ticket result** (`GET /v1/search/tickets` and `GET /v1/users/:id/tickets`):

```json
{
  "id": "guid",
  "workItemId": "IR1234",
  "title": "Printer not responding",
  "status": "Active",
  "priority": null,
  "tier": "Operations",
  "location": "Building A, 2nd Floor",
  "createdDate": "2026-07-01T09:00:00.000Z",
  "resolvedDate": "2026-07-02T10:00:00.000Z",
  "closedDate": null,
  "description": "Office printer offline...",
  "resolutionDescription": "Replaced the toner cartridge.",
  "affectedUser": { "id": "guid", "displayName": "John Smith" },
  "createdByUser": { "id": "guid", "displayName": "Jane Doe" },
  "assignedUser": { "id": "guid", "displayName": "Sam Cook" },
  "ticketType": "incident"
}
```

- `priority` is `null` for Incidents — the source schema has no priority column on `SM_WorkItem_Incident`; it is populated for Service Requests only.
- `tier` and `location` are `null` when the source row has no value; `relevance` is present only in `fts` mode when a rank was computed.
- `*User` fields are `null` when the corresponding user could not be resolved to a display name.
- `ticketType` is only present on results from `GET /v1/users/:id/tickets` (the merged union query).

**User result** (`GET /v1/search/users`):

```json
{
  "id": "guid",
  "userId": "jsmith",
  "displayName": "John Smith",
  "upn": "jsmith@nwu.ac.za"
}
```

### Errors

Every error is `{ "error": { "code": "...", "message": "..." } }`:

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION` | Query params failed zod validation |
| 400 | `AMBIGUOUS` | `/v1/users/:id/tickets` id matched multiple users |
| 401 | `UNAUTHORIZED` | Missing/invalid `x-api-key` |
| 404 | `NOT_FOUND` | Unknown route, or no user matched `:id` |
| 503 | `DB_UNAVAILABLE` | DB connection error (refused, timeout, reset, etc.) |
| 500 | `INTERNAL` | Anything else |

### Pagination

`page` defaults to `1`, `pageSize` to `25` (max `100`). Ordering follows the `sort` param: `relevance` (default), `newest` (created date descending), or `az` (title). Use `page * pageSize >= total` to know you've reached the end.

---

## Search modes

`SEARCH_MODE` selects the free-text backend:

- **`fts`** (default) — uses SQL Server Full-Text Search `CONTAINS()` for title/description, giving relevance-aware matching. **Requires a full-text catalog on `CiresonAnalytics`**; until the DW admin provisions one, searches fail. On startup the service probes `sys.fulltext_catalogs` and logs a warning (it does not crash) if the catalog is missing.
- **`like`** — `LIKE '%term%'` fallback. No catalog needed, but full scans are non-sargable and there is no relevance ranking. This is the mode currently used in production.

The `q` term is also always matched against `WorkItemId` via `LIKE`, in both modes.

---

## Configuration

All configuration comes from environment variables (see `.env.example`):

| Var | Default | Description |
|---|---|---|
| `DB_SERVER` | — | SQL Server host (required) |
| `DB_USER` | — | SQL login (required; should be read-only) |
| `DB_PASSWORD` | — | SQL password (required) |
| `API_KEYS` | — | Comma-separated `x-api-key` values (required) |
| `PORT` | `3000` | HTTP listen port (validated 1–65535) |
| `SEARCH_MODE` | `fts` | `fts` or `like` |
| `LOG_LEVEL` | `info` | pino log level (read by the app) |

The connection targets database **`CiresonAnalytics`** with `encrypt: true` and `trustServerCertificate: true` (the NWU warehouse uses a self-signed cert).

```bash
cp .env.example .env   # then fill in DB_SERVER/DB_USER/DB_PASSWORD/API_KEYS
```

---

## Local development

Requires Node.js ≥ 22.

```bash
npm install
npm run dev          # tsx watch src/server.ts — hot reload
```

Build and run the compiled output:

```bash
npm run build        # tsc → dist/
npm start            # node dist/server.js
```

Typecheck (ad-hoc; no lint config is shipped):

```bash
npx tsc --noEmit
```

---

## Deployment (Docker)

A multi-stage `Dockerfile` (build in `node:24-alpine`, runtime as a non-root `app` user) ships with a HEALTHCHECK against `/healthz`.

```bash
docker compose -f compose.scsm-search.yml up -d --build
```

`compose.scsm-search.yml`:

- publishes the container on `8080:8080` (matches `.env`'s `PORT=8080`)
- reads env from `.env` (`env_file`)
- joins the external `ai-stack_ai_net` Docker network so other stack services (e.g. PCM Compass) can reach it by service name
- `restart: unless-stopped` + a `PORT`-aware healthcheck

> The compose healthcheck interpolates `${PORT}` from compose's environment (which includes the project `.env`). Make sure it matches the `PORT` the app reads via `env_file`.

---

## Testing

```bash
npm test             # node --import tsx --test tests/*.test.ts
```

99 tests across 13 files (`node:test` + supertest against an in-memory app with a fake pool). All DB integration is against fakes — the suite needs no SQL Server.

---

## Smoke test

`scripts/smoke.sh` runs a manual end-to-end check against a live instance (sources `.env`, requires a reachable API):

```bash
./scripts/smoke.sh    # SMOKE_BASE overrides host/port, SMOKE_UPN overrides the UPN probe
```

It exercises `/healthz`, user search (`q=smith`), ticket search (`type=incident&q=printer`), and a UPN-resolved `/v1/users/:upn/tickets` call.

---

## Project structure

```
src/
  server.ts              # entry point (logger, loadConfig, start, exit on error)
  start.ts               # boot: validate env, connect pool, probe FTS catalog, listen
  app.ts                 # Express app factory (middleware + router wiring)
  config.ts              # env → AppConfig parsing/validation
  db/
    pool.ts              # mssql ConnectionPool factory (→ CiresonAnalytics)
    exec.ts              # parameterized query executor
    fts.ts               # full-text catalog existence probe
    queries/
      tickets.ts         # ticket search/count + user-tickets union SQL builders
      users.ts           # user search/count + id-resolve SQL builders
      meta.ts            # tier/status filter-values SQL builder
  middleware/
    auth.ts              # constant-time X-API-Key auth
    errorHandler.ts      # ZodError→400, conn errors→503, else 500
  routes/
    health.ts            # GET /healthz
    meta.ts              # /v1/meta/filters
    search.ts            # /v1/search/tickets, /v1/search/users
    users.ts             # /v1/users/:id/tickets
  schemas/searchParams.ts# zod query-param schemas
  serializers/ticket.ts  # DB row → API JSON shape
  types/                 # ticket.ts, domainUser.ts
tests/                   # node:test suites
scripts/smoke.sh         # manual smoke test
```

---

## Data sources

- **Tickets** — `CiresonAnalytics` tables `SM_WorkItem_Incident` and `SM_WorkItem_ServiceRequest` (queried separately; `UNION ALL` only for the user-ticket pivot, which adds the `ticketType` discriminator).
- **Users** — the warehouse view `ServiceManager.dbo.MTV_System$Domain$User`, using its hard-coded SCSM column GUIDs (`UserName_…`, `UPN_…`). User resolution uses `TRY_CONVERT(uniqueidentifier, @id)` so non-GUID ids (usernames/UPNs) resolve safely instead of failing with a conversion error.

---

## Security

- **Read-only SQL login.** The `DB_USER` account should have `SELECT` only on the relevant tables/views.
- **API keys, not sessions.** Constant-time (`timingSafeEqual`) comparison against all configured keys; keys are redacted from request logs.
- **Parameterized queries only.** Every input is bound via `mssql` parameters — no string concatenation, no SQL injection surface.
- **Minimal PII.** User results return only id/userId/displayName/UPN.

---

## Related projects

- **[PCM Compass](https://github.com/giiftmor/pcm_printer_search)** — the NWU PCM IT Service Desk toolkit. Its `/scsm-search` page (`modules/scsm_search/` in that repo) proxies this API: search, user lookup, and related-ticket tabs are all backed by the endpoints above. Compass talks to `scsm-search` over the shared `ai-stack_ai_net` Docker network using `SCSM_API_URL` / `SCSM_API_KEY`.
- **n8n** — may consume this API for orchestration (bots, digests, scheduled jobs) rather than querying SQL Server directly.
