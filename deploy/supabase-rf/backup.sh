#!/usr/bin/env bash
# Run on VPS as root; destination must be on encrypted storage in RF.
set -euo pipefail
umask 077
: "${BACKUP_ROOT:?Set BACKUP_ROOT to an encrypted RF backup volume}"
cd /opt/uchu-supabase/docker
mkdir -p "$BACKUP_ROOT"
DEST=$(mktemp -d "$BACKUP_ROOT/supabase-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
trap 'echo "Backup failed; incomplete directory: $DEST" >&2' ERR
# Stop writers for a coordinated database + object-storage backup.
# Maintenance window required; do not use this while users are writing.
[[ ${MAINTENANCE_CONFIRMED:-} == yes ]] || { echo 'Set MAINTENANCE_CONFIRMED=yes after stopping external writers'; exit 1; }
docker compose stop auth rest realtime storage functions studio
trap 'docker compose start auth rest realtime storage functions studio >/dev/null' EXIT
docker compose exec -T db pg_dump -U postgres -d postgres -Fc > "$DEST/database.dump"
docker compose exec -T db pg_dumpall -U postgres --roles-only > "$DEST/roles.sql"
cp .env "$DEST/server.env"
cp docker-compose.yml "$DEST/docker-compose.yml"
git rev-parse HEAD > "$DEST/upstream-revision.txt"
tar -czf "$DEST/storage.tar.gz" volumes/storage
# Includes auth password hashes, encryption keys and PII: never commit or publish.
(cd "$DEST" && sha256sum database.dump roles.sql server.env docker-compose.yml storage.tar.gz > SHA256SUMS)
chmod -R go-rwx "$DEST"
echo "Backup created: $DEST. Copy to separate encrypted RF storage and test recovery."
