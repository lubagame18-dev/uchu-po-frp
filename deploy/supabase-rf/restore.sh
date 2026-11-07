#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Использование: bash restore.sh /var/backups/uchu-supabase/db-....sql.gz" >&2
  exit 1
fi

DUMP="$1"
COMPOSE_DIR="${COMPOSE_DIR:-/opt/supabase/docker}"

[[ -f "$DUMP" ]] || { echo "Нет файла: $DUMP" >&2; exit 1; }

cd "$COMPOSE_DIR"
echo "Восстановление $DUMP в PostgreSQL..."
gunzip -c "$DUMP" | docker compose exec -T db psql -U postgres
echo "Готово. Проверьте вход и RLS."
