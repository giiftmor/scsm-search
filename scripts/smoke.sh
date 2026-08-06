#!/usr/bin/env bash
set -euo pipefail
# Manual smoke test against a running scsm-search instance.
# Requires .env with DB_SERVER/DB_USER/DB_PASSWORD/API_KEYS/PORT.
set -a
source .env
set +a
KEY="$(cut -d',' -f1 <<<"$API_KEYS")"
BASE="${SMOKE_BASE:-http://localhost:${PORT:-3000}}"

echo "== healthz =="
curl -fsS "$BASE/healthz"
echo
echo "== user search q=smith =="
curl -fsS -H "x-api-key: $KEY" "$BASE/v1/search/users?q=smith" | head -c 600
echo
echo "== ticket search type=incident q=printer =="
curl -fsS -H "x-api-key: $KEY" "$BASE/v1/search/tickets?type=incident&q=printer&pageSize=2" | head -c 600
echo
echo "== user tickets by UPN =="
UPN="${SMOKE_UPN:-jsmith@nwu.ac.za}"
curl -fsS -H "x-api-key: $KEY" "$BASE/v1/users/$UPN/tickets?pageSize=2" | head -c 600
echo
echo "OK"
