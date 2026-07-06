#!/bin/sh
# Aplikuje migracje z supabase/migrations/ na bazę Supabase.
# Wymaga SUPABASE_DB_URL w .env (Supabase → Connect → Session pooler URI).
set -e
cd "$(dirname "$0")/.."

set -a
. ./.env
set +a

if [ -z "$SUPABASE_DB_URL" ]; then
  echo "Brak SUPABASE_DB_URL w .env."
  echo "Supabase dashboard → Connect → Session pooler → skopiuj URI (z hasłem) i dodaj linię:"
  echo 'SUPABASE_DB_URL="postgresql://postgres.lbsppkimewwhmgahnwds:HASLO@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"'
  exit 1
fi

exec npx supabase db push --db-url "$SUPABASE_DB_URL" "$@"
