#!/usr/bin/env bash
# Disaster recovery onto a compatible initialized test stack, never blindly production.
set -euo pipefail
: "${RESTORE_DIR:?Set RESTORE_DIR}"
[[ ${CONFIRM_RESTORE:-} == restore-test-target ]] || { echo 'Set CONFIRM_RESTORE=restore-test-target'; exit 1; }
RESTORE_DIR=$(realpath "$RESTORE_DIR")
(cd "$RESTORE_DIR" && sha256sum -c SHA256SUMS)
cd /opt/uchu-supabase/docker
# Require identical secrets: encrypted DB fields/storage depend on them.
cmp --silent .env "$RESTORE_DIR/server.env" || { echo 'Provision isolated target using backed-up env and matching upstream revision first'; exit 1; }
docker compose stop auth rest realtime storage functions studio
# Full custom archive: only for the same stack version. --clean affects target DB.
docker compose exec -T db pg_restore -U postgres -d postgres --clean --if-exists \
  --exit-on-error --single-transaction < "$RESTORE_DIR/database.dump"
# Trusted local backup only; do not extract arbitrary archives.
tar -xzf "$RESTORE_DIR/storage.tar.gz"
docker compose up -d --wait --wait-timeout 300
echo 'Restore command succeeded. Run SQL and account/RLS/export tests before accepting recovery.'
