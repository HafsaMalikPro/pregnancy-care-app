#!/usr/bin/env bash
# Samples API process CPU/RSS and Postgres connections every INTERVAL seconds into a CSV.
# Local/staging use only. Usage:
#   tests/load/monitor.sh <api-pid> <out.csv> [db-container] [db-name] [interval]
set -euo pipefail

PID="$1"
OUT="$2"
CONTAINER="${3:-preconception-local-postgres-1}"
DB="${4:-preconception_test}"
INTERVAL="${5:-2}"

echo "ts,cpu_pct,rss_mb,db_conns_total,db_conns_active" > "$OUT"
while kill -0 "$PID" 2>/dev/null; do
  read -r cpu rss < <(ps -o %cpu=,rss= -p "$PID")
  conns=$(docker exec "$CONTAINER" psql -U preconception -d postgres -tAc \
    "SELECT count(*), count(*) FILTER (WHERE state = 'active') FROM pg_stat_activity WHERE datname = '$DB'" \
    2>/dev/null | tr '|' ',')
  echo "$(date +%s),$cpu,$((rss / 1024)),${conns:-,}" >> "$OUT"
  sleep "$INTERVAL"
done
