#!/usr/bin/env bash
# Official filtered Supabase export, not a raw dump of managed system schemas.
set -euo pipefail
umask 077
MODE=${1:-help}
: "${MIGRATION_DIR:?Set MIGRATION_DIR outside repository on encrypted RF storage}"
case "$MODE" in
  export)
    : "${SOURCE_DB_URL:?Set source direct/session connection URL (no password; use .pgpass)}"
    supabase db dump --help | grep -q -- '--remote' || { echo 'Requires CLI with --remote flag (v3). Check README.'; exit 1; }
    mkdir -p "$MIGRATION_DIR"
    [[ ! -e $MIGRATION_DIR/data.sql ]] || { echo 'Export exists; choose a new directory'; exit 1; }
    supabase db dump --remote="$SOURCE_DB_URL" --role-only -f "$MIGRATION_DIR/roles.sql"
    supabase db dump --remote="$SOURCE_DB_URL" -f "$MIGRATION_DIR/schema.sql"
    supabase db dump --remote="$SOURCE_DB_URL" --use-copy --data-only -f "$MIGRATION_DIR/data.sql"
    (cd "$MIGRATION_DIR" && sha256sum roles.sql schema.sql data.sql > SHA256SUMS)
    ;;
  import)
    : "${TARGET_DB_URL:?Set target connection URL (use .pgpass)}"
    [[ ${CONFIRM_IMPORT:-} == empty-test-target ]] || { echo 'Set CONFIRM_IMPORT=empty-test-target after compatibility review'; exit 1; }
    (cd "$MIGRATION_DIR" && sha256sum -c SHA256SUMS)
    # All-or-nothing. Do not suppress errors or strip auth data to make import pass.
    psql -X "$TARGET_DB_URL" --single-transaction --set ON_ERROR_STOP=1 \
      --file "$MIGRATION_DIR/roles.sql" --file "$MIGRATION_DIR/schema.sql" \
      --command 'SET session_replication_role = replica' --file "$MIGRATION_DIR/data.sql"
    ;;
  *) echo 'Usage: migrate.sh export|import'; exit 2 ;;
esac
