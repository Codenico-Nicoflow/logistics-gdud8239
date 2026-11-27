#!/usr/bin/env bash
# One command to run the whole app locally: `npm start` (or `npm run stop` to kill it).
# It also repairs the usual "500 after a pull" causes: a stale Prisma client and unapplied migrations.
set -euo pipefail
cd "$(dirname "$0")/.."

PORTS=(3000 5173)

stop() {
  for p in "${PORTS[@]}"; do
    pids=$(lsof -ti ":$p" 2>/dev/null || true)
    [ -n "$pids" ] && kill $pids 2>/dev/null || true
  done
}

if [ "${1:-}" = "stop" ]; then
  stop
  echo "stopped api + web"
  exit 0
fi

stop

echo "→ database"
npm run db:up --silent
until docker exec logistics-db pg_isready -U logistics >/dev/null 2>&1; do sleep 1; done

echo "→ prisma generate + migrate deploy"
(cd apps/api && npx prisma generate >/dev/null && npx prisma migrate deploy)

echo "→ api :3000 + web :5173  (Ctrl+C stops both)"
trap 'stop; exit 0' INT TERM
npm run dev:api &
npm run dev:web &
wait
