#!/usr/bin/env bash
# Offline portable backup; no provider, server creation, or payment required by this script.
set -euo pipefail
umask 077
: "${PB_DATA_DIR:?Set PB_DATA_DIR}"
: "${PB_BACKUP_ROOT:?Set encrypted backup destination outside repository and static bucket}"
[[ ${PB_IS_STOPPED:-} == yes ]] || { echo 'Stop PocketBase before copying SQLite; PB_IS_STOPPED=yes required'; exit 1; }
DATA=$(realpath "$PB_DATA_DIR")
mkdir -p "$PB_BACKUP_ROOT"
ROOT=$(realpath "$PB_BACKUP_ROOT")
[[ $ROOT != "$DATA" && $ROOT != "$DATA/"* ]] || { echo 'Backup cannot be inside live database'; exit 1; }
DEST=$(mktemp -d "$ROOT/pocketbase-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
tar -czf "$DEST/pb_data.tar.gz" -C "$DATA" .
(cd "$DEST" && sha256sum pb_data.tar.gz > SHA256SUMS)
chmod -R go-rwx "$DEST"
echo "Snapshot written: $DEST. Retain the PocketBase version, hooks, migrations and settings encryption key separately."
