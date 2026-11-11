#!/usr/bin/env bash
# Add offsite tooling to the existing VPS. No credentials, DNS, billing or auth changes.
set -euo pipefail
umask 077
[[ $EUID == 0 ]] || { echo 'Run as root on the VPS'; exit 2; }
systemctl is-active --quiet pocketbase
[[ -x /usr/local/sbin/uchu-pocketbase-backup && -f /root/uchu-private-login.py ]]
[[ -f /etc/systemd/system/uchu-pocketbase-backup.service ]]
DROPIN=/etc/systemd/system/uchu-pocketbase-backup.service.d/offsite.conf
if [[ -e $DROPIN ]] && ! grep -q '^# uchu-managed-offsite-v1$' "$DROPIN"; then
  echo 'Existing custom backup drop-in requires review'; exit 1
fi
REF=e9a96e18c37e7422fc1aa21d38996e5210679207
BASE="https://raw.githubusercontent.com/lubagame18-dev/uchu-po-frp/$REF/deploy/pocketbase"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
for file in backup-s3.py enter-backup-secret.py; do
  curl --proto '=https' --tlsv1.2 -fSsL --retry 2 "$BASE/$file" -o "$STAGE/$file"
done
(cd "$STAGE" && sha256sum -c - <<'SHA'
97097875bae9bdc2d1ff106341c8d20e81d5f95db747624d30364307e62ef04f  backup-s3.py
59fdb795c7b1dd116905d8d5482db6b60654e6549ccda5dc6fec6e73a742ea05  enter-backup-secret.py
SHA
)
export DEBIAN_FRONTEND=noninteractive
apt-get -o Dpkg::Use-Pty=0 install -y python3-boto3
/usr/bin/python3 -c 'import boto3'
install -m 700 "$STAGE/backup-s3.py" /usr/local/sbin/uchu-pocketbase-backup-s3
install -m 700 "$STAGE/enter-backup-secret.py" /root/uchu-private-backup.py
install -d -m 755 /etc/systemd/system/uchu-pocketbase-backup.service.d
cat > "$DROPIN" <<'UNIT'
# uchu-managed-offsite-v1
[Service]
ExecStartPost=/usr/bin/python3 /usr/local/sbin/uchu-pocketbase-backup-s3 --if-configured
TimeoutStartSec=10min
UNIT
chmod 644 "$DROPIN"
systemctl daemon-reload
echo 'Backup tooling installed. Without a private S3 key it skips network requests.'
echo 'Cloud permissions, upload, remote restore and separate recovery-key custody still need acceptance.'
