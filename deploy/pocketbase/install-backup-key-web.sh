#!/usr/bin/env bash
# Temporary HTTPS input or recovery-key download; no PocketBase auth changes.
set -euo pipefail
umask 077
ENTRY_ARGUMENT=${1:-}
[[ $EUID == 0 && $# == 1 && ( $ENTRY_ARGUMENT == --recovery-download || $ENTRY_ARGUMENT =~ ^[A-Za-z0-9_-]{16,128}$ ) ]] || { echo 'Run as root with a public S3 key ID or --recovery-download'; exit 2; }
ENTRY_ARGS=(--key-id "$ENTRY_ARGUMENT")
if [[ $ENTRY_ARGUMENT == --recovery-download ]]; then ENTRY_ARGS=(--recovery-download); fi
[[ -x /root/uchu-private-backup.py && -x /usr/local/sbin/uchu-pocketbase-backup-s3 ]]
systemctl is-active --quiet pocketbase
systemctl is-active --quiet caddy
if systemctl is-active --quiet uchu-backup-web.service; then
  echo 'Private form is already active; do not restart while owner is entering the key'; exit 1
fi
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
curl --proto '=https' --tlsv1.2 -fSsL --retry 2 \
  https://raw.githubusercontent.com/lubagame18-dev/uchu-po-frp/9f15d3242eda814c2c837a907a178db7544da7ca/deploy/pocketbase/backup-key-web.py \
  -o "$STAGE/backup-key-web.py"
(cd "$STAGE" && sha256sum -c - <<'SHA'
c27760f2c51749523c6933f4c9272e5f4d1cf013d77b2b470f2cc0ecc146dd16  backup-key-web.py
SHA
)
install -m 700 "$STAGE/backup-key-web.py" /root/uchu-backup-key-web.py
# Stage and validate the exact Caddy change before replacing the active config.
python3 - "$STAGE/Caddyfile" <<'PY'
import hashlib,json,sys
from pathlib import Path
p=Path('/etc/caddy/Caddyfile');s=p.read_text()
assert 'uchu-pocketbase-managed' in s and 'accounts.uchu-po-frp.ru {' in s
if 'handle /private-backup-setup/*' not in s:
    assert s.count('@private not path ')==1
    lines=s.splitlines()
    for i,line in enumerate(lines):
        if '@private not path ' in line:lines[i]=line+' /private-backup-setup/*'
    s='\n'.join(lines)+'\n'
    original='    reverse_proxy 127.0.0.1:8090 {'
    assert s.count(original)==1
    s=s.replace(original,'    handle /private-backup-setup/* {\n        reverse_proxy 127.0.0.1:8091\n    }\n'+original,1)
    backup=Path('/etc/caddy/Caddyfile.before-private-backup-setup')
    if backup.exists():assert backup.read_bytes()==p.read_bytes()
    else:backup.write_bytes(p.read_bytes());backup.chmod(0o600)
Path(sys.argv[1]).write_text(s)
marker=Path('/run/uchu-backup-web-config.json')
marker.write_text(json.dumps({'installed_sha256':hashlib.sha256(s.encode()).hexdigest(),'cleanup_backup':'/etc/caddy/Caddyfile.before-private-backup-setup'}));marker.chmod(0o600)
PY
caddy validate --config "$STAGE/Caddyfile" --adapter caddyfile
systemctl reset-failed uchu-backup-web.service 2>/dev/null || true
systemd-run --unit=uchu-backup-web -p UMask=0077 -p NoNewPrivileges=yes -p PrivateTmp=yes \
  -p ProtectSystem=strict -p ProtectHome=read-only -p 'ReadWritePaths=/etc/pocketbase /run' \
  -p CapabilityBoundingSet= -p MemoryMax=160M -p RuntimeMaxSec=1800 \
  /usr/bin/python3 /root/uchu-backup-key-web.py "${ENTRY_ARGS[@]}"
for attempt in $(seq 1 30); do
  if curl -fSs --max-time 2 -H 'Host: accounts.uchu-po-frp.ru' http://127.0.0.1:8091/private-backup-setup/ -o /dev/null; then break; fi
  [[ $attempt != 30 ]] || { echo 'Private entry did not start; existing Caddy config was not replaced'; exit 1; }
  sleep .2
done
install -m 644 "$STAGE/Caddyfile" /etc/caddy/Caddyfile
systemctl reload caddy
echo 'Private backup page is active for 30 minutes. Capability link is root-only in /run/uchu-backup-private-link.'
echo 'After owner saves a verified key, remove the temporary route using the saved config checksum guard.'
