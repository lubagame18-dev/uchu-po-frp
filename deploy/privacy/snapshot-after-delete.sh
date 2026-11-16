#!/usr/bin/env bash
set -euo pipefail
umask 077
flag=/var/lib/pocketbase/.privacy-backup-needed
last=/var/backups/pocketbase/privacy-snapshot.ok
exec 9>/run/uchu-privacy-snapshot.lock
flock -n 9 || exit 75
[[ -f $flag ]] || exit 0
# Coalesce deletions to at most one extra full snapshot/hour on the small VPS.
if [[ -f $last ]] && (( $(date +%s) - $(stat -c %Y "$last") < 3600 )); then exit 75; fi
for attempt in $(seq 1 120); do
  state=$(systemctl show uchu-pocketbase-backup.service --property=ActiveState --value)
  [[ $state == inactive || $state == failed ]] && break
  sleep 1
done
[[ $state == inactive || $state == failed ]] || exit 75
before=$(sha256sum "$flag" | cut -d' ' -f1)
systemctl start uchu-pocketbase-backup.service
/usr/local/sbin/uchu-pocketbase-restore-s3-check >/dev/null
touch "$last"
if [[ -f $flag && $(sha256sum "$flag" | cut -d' ' -f1) == "$before" ]]; then rm -f "$flag"; else exit 75; fi
