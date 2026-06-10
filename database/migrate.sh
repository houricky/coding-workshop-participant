#!/usr/bin/env bash
# Apply ACME database schema and optional seed data to PostgreSQL.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PGHOST="${POSTGRES_HOST:-localhost}"
PGPORT="${POSTGRES_PORT:-5432}"
PGDATABASE="${POSTGRES_NAME:-postgres}"
PGUSER="${POSTGRES_USER:-postgres}"
export PGPASSWORD="${POSTGRES_PASS:-postgres123}"

SEED="${1:-}"

echo "Applying ACME database migrations to ${PGHOST}:${PGPORT}/${PGDATABASE}..."

for sql_file in "$SCRIPT_DIR"/schema/*.sql; do
    echo "  -> $(basename "$sql_file")"
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -f "$sql_file" -q
done

if [ "$SEED" = "--seed" ] || [ "${ACME_SEED_DB:-}" = "true" ]; then
    for sql_file in "$SCRIPT_DIR"/seed/*.sql; do
        echo "  -> seed/$(basename "$sql_file")"
        psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -f "$sql_file" -q
    done
fi

echo "Database migration complete."
