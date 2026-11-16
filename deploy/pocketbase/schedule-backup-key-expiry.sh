#!/usr/bin/env bash
# Close the temporary route only if it still belongs to this service invocation.
set -euo pipefail
[[ $EUID == 0 && -f /run/uchu-backup-web-config.json ]] || exit 2
UCHU_INPUT_INVOCATION=$(systemctl show uchu-backup-web.service -p InvocationID --value)
[[ $UCHU_INPUT_INVOCATION =~ ^[a-f0-9]{32}$ ]]
systemd-run --unit="uchu-backup-expiry-$UCHU_INPUT_INVOCATION" \
  --on-active=31m --timer-property=AccuracySec=1s \
  /bin/bash -c 'if [[ $(systemctl show uchu-backup-web.service -p InvocationID --value 2>/dev/null) == "$1" ]]; then /usr/bin/python3 /root/uchu-close-backup-web.py --apply; fi' \
  uchu-expiry "$UCHU_INPUT_INVOCATION"
echo 'Expiry cleanup scheduled for this invocation only; newer sessions are preserved.'
