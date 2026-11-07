#!/usr/bin/env bash
set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-/opt/supabase/docker}"
OUT="${OUT:-/var/backups/uchu-supabase}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

cd "$COMPOSE_DIR"

echo "Дамп PostgreSQL..."
docker compose exec -T db pg_dumpall -U postgres | gzip > "$OUT/db-$STAMP.sql.gz"

# Storage: официальный compose хранит файлы в named volume.
# Найдите его: docker volume ls | grep storage
# Затем раскомментируйте и подставьте имя:
# docker run --rm -v <volume>:/data -v "$OUT":/backup alpine \
#   tar czf "/backup/storage-$STAMP.tar.gz" -C /data .

echo "Готово: $OUT/db-$STAMP.sql.gz"
find "$OUT" -type f -name '*.gz' -mtime +14 -delete
