#!/usr/bin/env bash
# Restore a full DB backup (logistics-db-*.sql.gz, from גיבויים) into an EMPTY database.
#
#   scripts/restore-db.sh <dump.sql.gz> [<target-postgres-url>] [--compare <source-postgres-url>]
#   RESTORE_DATABASE_URL=<url> npm run restore -- <dump.sql.gz>
#
# The target comes from the argument or from RESTORE_DATABASE_URL — deliberately
# not from DATABASE_URL, so a shell that happens to point at production can never
# be restored into by accident.
#
# Refuses to touch a database that already has tables: a dump has no DROP statements,
# and silently merging a backup into live data is worse than failing. Restore into a
# fresh database, check it, then point the API's DATABASE_URL at it.
#
# --compare checks every table's row count against another database (use it against
# the original when testing a restore, or skip it in a real disaster).
set -euo pipefail

DUMP="${1:-}"; shift || true
TARGET="${RESTORE_DATABASE_URL:-}"
if [[ -n "${1:-}" && "${1:-}" != "--compare" ]]; then TARGET="$1"; shift; fi
SOURCE=""
if [[ "${1:-}" == "--compare" ]]; then SOURCE="${2:-}"; fi
if [[ -z "$DUMP" || -z "$TARGET" || ! -f "$DUMP" ]]; then
  echo "usage: $0 <dump.sql.gz> [<target-postgres-url>] [--compare <source-postgres-url>]  (or set RESTORE_DATABASE_URL)" >&2; exit 2
fi

# psql does not understand Prisma's ?schema= parameter.
strip() { echo "${1%%\?*}"; }
T="$(strip "$TARGET")"

existing=$(psql "$T" -tA -c "select count(*) from information_schema.tables where table_schema = 'public'")
if [[ "$existing" != "0" ]]; then
  echo "target already has $existing tables — restore into an empty database" >&2; exit 1
fi

# A dump made by a newer pg_dump than the server restoring it carries lines the
# older server rejects (SET transaction_timeout, psql's \restrict guard). They
# are session settings / safety guards, not data, so dropping them is safe.
# `CREATE SCHEMA public;` is dropped too: a fresh database already has it.
gunzip -c "$DUMP" \
  | grep -v -E '^(SET transaction_timeout|CREATE SCHEMA public;|\\restrict |\\unrestrict )' \
  | psql "$T" -v ON_ERROR_STOP=1 -q --single-transaction >/dev/null

tables=$(psql "$T" -tA -c "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1")
echo "restored $(echo "$tables" | wc -l | tr -d ' ') tables"

status=0
for t in $tables; do
  n=$(psql "$T" -tA -c "select count(*) from \"$t\"")
  if [[ -n "$SOURCE" ]]; then
    m=$(psql "$(strip "$SOURCE")" -tA -c "select count(*) from \"$t\"")
    if [[ "$n" == "$m" ]]; then echo "ok    $t $n"; else echo "DIFF  $t restored=$n source=$m"; status=1; fi
  else
    echo "      $t $n"
  fi
done
exit $status
