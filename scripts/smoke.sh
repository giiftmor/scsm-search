#!/usr/bin/env bash
set -euo pipefail
# Manual smoke test against a running scsm-search instance.
# Requires .env with DB_SERVER/DB_USER/DB_PASSWORD/API_KEYS/PORT.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
set -a
source "$SCRIPT_DIR/../.env"
set +a
if [[ -z "${DB_SERVER:-}" || -z "${DB_USER:-}" || -z "${DB_PASSWORD:-}" || -z "${API_KEYS:-}" ]]; then
  echo "error: .env must set DB_SERVER, DB_USER, DB_PASSWORD, API_KEYS" >&2
  exit 1
fi
KEY="$(cut -d',' -f1 <<<"$API_KEYS")"
BASE="${SMOKE_BASE:-http://localhost:${PORT:-3000}}"

get() { # GET <path> — fetch and print at most 600 chars (no pipe, EPIPE-safe)
  local url="$1"
  local body
  body="$(curl -fsS -H "x-api-key: $KEY" "$url")"
  printf '%s\n' "${body:0:600}"
}

echo "== healthz =="
get "$BASE/healthz"
echo
echo "== user search q=smith =="
get "$BASE/v1/search/users?q=smith"
echo
echo "== ticket search type=incident q=printer =="
get "$BASE/v1/search/tickets?type=incident&q=printer&pageSize=2"
echo
echo "== user tickets by UPN =="
UPN="${SMOKE_UPN:-$(get "$BASE/v1/search/users?q=smith&pageSize=1" | python3 -c "import json,sys; print(json.load(sys.stdin)['results'][0]['upn'])" 2>/dev/null || echo 'jsmith@nwu.ac.za')}"
echo "UPN: $UPN"
get "$BASE/v1/users/$UPN/tickets?pageSize=2"
echo
echo "OK"
