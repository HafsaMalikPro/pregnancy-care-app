#!/usr/bin/env bash
# Runs tests/load/journeys.js against a locally started API on a disposable database.
# Never point this at a shared or production database.
#
#   DATABASE_URL=postgresql://…@localhost:5434/preconception_load tests/load/run-journeys.sh [label]
#
# NODE_ENV=staging with RATE_LIMIT_ENABLED=false: production refuses to boot without rate
# limiting, and k6 sends everything from one IP.
set -euo pipefail
cd "$(dirname "$0")/../.."

LABEL="${1:-run}"
shift $(( $# > 0 ? 1 : 0 ))
: "${DATABASE_URL:?set DATABASE_URL to a disposable local database}"
case "$DATABASE_URL" in
  *localhost*|*127.0.0.1*) ;;
  *) echo "Refusing to run against a non-local DATABASE_URL" >&2; exit 1 ;;
esac
export PORT="${PORT:-4100}" NODE_ENV=staging RATE_LIMIT_ENABLED=false

# Throwaway secret for this local run unless one is provided.
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-$(openssl rand -hex 32)}"

RESULTS=tests/load/results
mkdir -p "$RESULTS"
STAMP="journeys-${LABEL}"

node apps/api/dist/main.js > "$RESULTS/$STAMP.server.log" 2>&1 &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do
  curl -sf "http://localhost:$PORT/v1/health/live" >/dev/null && break
  sleep 0.5
done

DB_NAME="${DATABASE_URL##*/}"; DB_NAME="${DB_NAME%%\?*}"
tests/load/monitor.sh "$API_PID" "$RESULTS/$STAMP.resources.csv" preconception-local-postgres-1 "$DB_NAME" &
MON_PID=$!
k6 run -e BASE_URL="http://localhost:$PORT" --summary-export "$RESULTS/$STAMP.json" \
  "$@" tests/load/journeys.js || STATUS=$?
kill "$MON_PID" 2>/dev/null || true
exit "${STATUS:-0}"
