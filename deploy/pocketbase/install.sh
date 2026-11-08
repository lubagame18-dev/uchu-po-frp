#!/usr/bin/env bash
# Run on the Ubuntu VPS. Downloads only the account kit at an immutable Git commit.
set -euo pipefail
umask 077
REF=''
if [[ $# == 2 && $1 == --ref ]]; then REF=$2; fi
[[ $REF =~ ^[0-9a-f]{40}$ ]] || { echo 'Usage: sudo bash install.sh --ref <40-character Git commit>'; exit 2; }
[[ $EUID == 0 ]] || { echo 'Run with sudo on the Ubuntu VPS'; exit 2; }
source /etc/os-release
[[ $ID == ubuntu && $(uname -m) == x86_64 && -d /run/systemd/system ]] || { echo 'Ubuntu amd64 with systemd is required'; exit 2; }
command -v flock >/dev/null
exec 9>/run/uchu-pocketbase-install.lock
flock -n 9 || { echo 'Another installation is running'; exit 1; }
# Re-running never upgrades or replaces a running installation/database.
[[ ! -e /opt/pocketbase/pocketbase && ! -e /etc/systemd/system/pocketbase.service && ! -e /var/lib/pocketbase/data.db ]] || {
  echo 'Existing installation detected. Refusing to overwrite; back up and review an upgrade first.'; exit 1;
}
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -o Dpkg::Use-Pty=0 install -y python3 python3-pip python3-venv ca-certificates curl unzip dnsutils
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
BASE="https://raw.githubusercontent.com/lubagame18-dev/uchu-po-frp/$REF/deploy/pocketbase"
FILES=(pocketbase.service backup.sh restore.sh Caddyfile.example
 pb_hooks/uchu.js pb_hooks/uchu.pb.js pb_hooks/identities.js pb_hooks/identity-providers.js pb_hooks/registration.pb.js
 pb_migrations/1794069018_uchu_accounts.js pb_migrations/1794072092_account_identities.js pb_migrations/1794084615_google_identity.js)
for file in "${FILES[@]}"; do
  mkdir -p "$STAGE/$(dirname "$file")"
  curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location --max-time 60 "$BASE/$file" -o "$STAGE/$file"
done
# Resolve latest stable release, but refuse untested versions before changing server services.
python3 - "$STAGE" <<'PY'
import hashlib,io,json,pathlib,sys,urllib.request,zipfile
root=pathlib.Path(sys.argv[1])
with urllib.request.urlopen('https://api.github.com/repos/pocketbase/pocketbase/releases/latest',timeout=30) as r:release=json.load(r)
version=release['tag_name'].removeprefix('v')
if version!='0.40.6' or release.get('prerelease') or release.get('draft'):
    raise SystemExit('Latest PocketBase differs from tested 0.40.6. Stop for compatibility review; no service installed.')
base='https://github.com/pocketbase/pocketbase/releases/download/v'+version+'/'
name='pocketbase_'+version+'_linux_amd64.zip'
with urllib.request.urlopen(base+'checksums.txt',timeout=30) as r:sums=r.read().decode()
expected=next(line.split()[0] for line in sums.splitlines() if line.split()[-1].lstrip('*')==name)
with urllib.request.urlopen(base+name,timeout=60) as r:archive=r.read()
if hashlib.sha256(archive).hexdigest()!=expected:raise SystemExit('PocketBase checksum mismatch')
with zipfile.ZipFile(io.BytesIO(archive)) as z:(root/'pocketbase').write_bytes(z.read('pocketbase'))
PY
id -u pocketbase >/dev/null 2>&1 || useradd --system --home-dir /var/lib/pocketbase --shell /usr/sbin/nologin pocketbase
install -d -m 755 /opt/pocketbase
install -d -m 700 -o pocketbase -g pocketbase /var/lib/pocketbase
install -d -m 700 /etc/pocketbase
install -m 755 "$STAGE/pocketbase" /opt/pocketbase/pocketbase
for file in "${FILES[@]}"; do
  install -d -m 755 "/opt/pocketbase/$(dirname "$file")"
  install -m 644 "$STAGE/$file" "/opt/pocketbase/$file"
done
python3 -m venv /opt/pocketbase/tools-venv
/opt/pocketbase/tools-venv/bin/pip --disable-pip-version-check install 'requests==2.34.2'
python3 - <<'PY'
import os,secrets
path='/etc/pocketbase/pocketbase.env'
if not os.path.exists(path):
    with os.fdopen(os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600),'w') as f:
        f.write('UCHU_SERVICE_TOKEN='+secrets.token_hex(32)+'\nPB_SETTINGS_KEY='+secrets.token_hex(16)+'\n')
        f.write('UCHU_SITE_ORIGIN=https://uchu-po-frp.ru\nUCHU_ALLOW_SIGNUP=false\nUCHU_ALLOW_SMS=false\nUCHU_ALLOW_SMS_SIGNUP=false\nUCHU_ALLOW_YANDEX=false\nUCHU_ALLOW_YANDEX_SIGNUP=false\nUCHU_ALLOW_GOOGLE=false\nUCHU_ALLOW_GOOGLE_SIGNUP=false\n')
# Refuse unsafe existing secrets rather than generating replacement encryption keys.
if os.stat(path).st_mode & 0o077:raise SystemExit('Environment permissions must be 600')
values=dict(line.strip().split('=',1) for line in open(path) if line.strip() and not line.startswith('#'))
if len(values.get('PB_SETTINGS_KEY',''))!=32 or len(values.get('UCHU_SERVICE_TOKEN',''))<32:raise SystemExit('Invalid existing server secrets')
PY
install -m 644 /opt/pocketbase/pocketbase.service /etc/systemd/system/pocketbase.service
systemctl daemon-reload
systemctl enable --now pocketbase.service
for attempt in {1..30}; do
  if curl -fsS --max-time 2 http://127.0.0.1:8090/api/uchu/auth/v1/health >/dev/null; then break; fi
  if [[ $attempt == 30 ]]; then echo 'Local health failed. Inspect: sudo journalctl -u pocketbase --no-pager -n 40'; exit 1; fi
  sleep 1
done
echo 'PocketBase local health OK; systemd autostart enabled. Registration and SMS disabled.'
echo 'Pending: accounts DNS in Yandex, HTTPS, SMTP, Google/Yandex credentials, backups and live acceptance. Main site was not switched.'
echo 'Provider accounts are not accessed. SpaceWeb domain/mail and Yandex DNS/site/function stay unchanged.'
