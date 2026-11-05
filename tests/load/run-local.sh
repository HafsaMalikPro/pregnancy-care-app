#!/usr/bin/env bash
# Runs one k6 scenario against a locally started, production-mode API on the isolated test
# database. Never point this at a shared or production database.
#
#   tests/load/run-local.sh <scenario> [label] [extra k6 args...]
#
# Env: DATABASE_URL (default: local preconception_test), PORT (default 4100), and any
# api-load.js variable (VUS, THINK_MIN, THINK_MAX, SOAK_DURATION).
set -euo pipefail
cd "$(dirname "$0")/../.."

SCENARIO="${1:?scenario required: smoke|sustained|spike|soak|stress}"
LABEL="${2:-run}"
shift $(( $# >= 2 ? 2 : 1 ))

export PORT="${PORT:-4100}"
export DATABASE_URL="${DATABASE_URL:-postgresql://preconception:preconception_local@localhost:5434/preconception_test}"
export NODE_ENV=production
# Production refuses to boot with development settings; these are placeholders for a local run.
export BETTER_AUTH_URL="${BETTER_AUTH_URL:-https://api.load.test}"
export APP_URL="${APP_URL:-https://app.load.test}"
export CORS_ORIGINS="${CORS_ORIGINS:-https://app.load.test}"
case "$DATABASE_URL" in
  *localhost*|*127.0.0.1*) ;;
  *) echo "Refusing to run against a non-local DATABASE_URL" >&2; exit 1 ;;
esac

# Throwaway secret for this local run unless one is provided.
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-$(openssl rand -hex 32)}"

RESULTS=tests/load/results
mkdir -p "$RESULTS"
STAMP="${SCENARIO}-${LABEL}"

node apps/api/dist/main.js > "$RESULTS/$STAMP.server.log" 2>&1 &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT

for _ in $(seq 1 30); do
  curl -sf "http://localhost:$PORT/v1/health/live" >/dev/null && break
  sleep 0.5
done

tests/load/monitor.sh "$API_PID" "$RESULTS/$STAMP.resources.csv" &
MON_PID=$!

k6 run -e SCENARIO="$SCENARIO" -e BASE_URL="http://localhost:$PORT" \
  -e RESULT_FILE="$RESULTS/$STAMP.json" "$@" tests/load/api-load.js || K6_EXIT=$?

kill $MON_PID 2>/dev/null || true
echo "results: $RESULTS/$STAMP.json  resources: $RESULTS/$STAMP.resources.csv"
exit "${K6_EXIT:-0}"
