# scsm-search

SCSM ticket/user search HTTP API (search the CiresonAnalytics + ServiceManager warehouse read-only).

## API

All `/v1` routes require `x-api-key` (from `API_KEYS` in `.env`).

- `GET /healthz` — liveness + DB connectivity (503 if DB unreachable)
- `GET /v1/search/tickets?type=incident|servicerequest&q=&status=&priority=&page=&pageSize=`
- `GET /v1/search/users?q=&page=&pageSize=`
- `GET /v1/users/:id/tickets?page=&pageSize=` — `:id` resolves by GUID, username, or UPN

## Run

```bash
cp .env.example .env   # fill DB_SERVER/DB_USER/DB_PASSWORD/API_KEYS
docker compose -f compose.scsm-search.yml up -d --build
./scripts/smoke.sh     # requires a reachable API (SMOKE_BASE overrides host/port)
```

`SEARCH_MODE=fts` requires a full-text catalog on CiresonAnalytics; until the DW admin provisions one, use `SEARCH_MODE=like`. The container healthcheck (in both the image and compose) calls `/healthz`; note `trustServerCertificate:false` means a self-signed SQL Server cert would fail the healthcheck (confirm the cert or the operator flips the flag).
