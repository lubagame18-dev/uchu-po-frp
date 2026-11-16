#!/usr/bin/env bash
# Restores into a NEW directory only. Never erases a live database.
set -euo pipefail
umask 077
: "${PB_RESTORE_FROM:?Set snapshot directory}"
: "${PB_RESTORE_TO:?Set a new target data directory}"
[[ ${PB_IS_STOPPED:-} == yes ]] || { echo 'Stop the target PocketBase process first'; exit 1; }
[[ ! -e $PB_RESTORE_TO ]] || { echo 'Target exists; refusing to overwrite'; exit 1; }
SOURCE=$(realpath "$PB_RESTORE_FROM")
(cd "$SOURCE" && sha256sum -c SHA256SUMS)
# Only trusted locally generated snapshots. No network archive is accepted here.
mkdir -m 700 -p "$PB_RESTORE_TO"
tar -xzf "$SOURCE/pb_data.tar.gz" -C "$PB_RESTORE_TO"
touch "$PB_RESTORE_TO/.privacy-review-required"
echo 'Snapshot extracted; apply the latest signed deletion ledger before production use. Start the pinned binary with matching hooks and key, then run acceptance tests.'
