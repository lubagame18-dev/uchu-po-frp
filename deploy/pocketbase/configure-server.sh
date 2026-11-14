#!/usr/bin/env bash
# Post-install on a new Ubuntu VPS. No DNS/billing/SMTP/OAuth changes.
set -euo pipefail
umask 077
[[ $EUID == 0 ]] || { echo 'Run as root on the VPS'; exit 2; }
[[ ${1:-} == accounts.uchu-po-frp.ru && $# == 1 ]] || { echo 'Usage: configure-server.sh accounts.uchu-po-frp.ru'; exit 2; }
systemctl is-active --quiet pocketbase.service
[[ $(/opt/pocketbase/pocketbase --version) == 'pocketbase version 0.40.6' ]]
[[ -f /etc/pocketbase/pocketbase.env && -d /var/lib/pocketbase ]]
# A custom existing web server needs review, never silently replace its config.
if [[ -f /etc/caddy/Caddyfile ]] && ! grep -q 'uchu-pocketbase-managed' /etc/caddy/Caddyfile; then
  echo 'Existing Caddy configuration detected; review it before running this step'; exit 1
fi
export DEBIAN_FRONTEND=noninteractive
apt-get -o Dpkg::Use-Pty=0 install -y age caddy
systemctl stop caddy
cp -p /etc/caddy/Caddyfile /etc/caddy/Caddyfile.before-uchu
cat > /etc/caddy/Caddyfile <<'CADDY'
# uchu-pocketbase-managed: only the new account hostname
accounts.uchu-po-frp.ru {
    @private not path /api/uchu/* /api/collections/uchu_users/confirm-verification /api/collections/uchu_users/confirm-password-reset
    respond @private 404
    header {
        X-Content-Type-Options nosniff
        Referrer-Policy no-referrer
    }
    reverse_proxy 127.0.0.1:8090 {
        # Replace any client-supplied value. PocketBase is bound to loopback only.
        header_up X-Real-IP {http.request.remote.host}
    }
}
CADDY
chmod 644 /etc/caddy/Caddyfile
runuser -u caddy -- test -r /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
# Configure rate-limit source IP only for the loopback service behind the above proxy.
cat > /opt/pocketbase/pb_hooks/network.pb.js <<'JS'
onBootstrap((e) => {
  e.next();
  if ($os.getenv('UCHU_TRUST_PROXY') !== 'true') return;
  const settings=e.app.settings();
  settings.trustedProxy.headers=['X-Real-IP'];
  settings.trustedProxy.useLeftmostIP=false;
  e.app.save(settings);
});
JS
chmod 644 /opt/pocketbase/pb_hooks/network.pb.js
runuser -u pocketbase -- test -r /opt/pocketbase/pb_hooks/network.pb.js
python3 - <<'PY'
from pathlib import Path
p=Path('/etc/pocketbase/pocketbase.env')
lines=[line for line in p.read_text().splitlines() if not line.startswith('UCHU_TRUST_PROXY=')]
p.write_text('\n'.join(lines)+'\nUCHU_TRUST_PROXY=true\n');p.chmod(0o600)
PY
systemctl restart pocketbase
systemctl enable --now caddy
install -d -m 700 /var/backups/pocketbase
if [[ ! -f /etc/pocketbase/backup.agekey ]]; then
  age-keygen -o /etc/pocketbase/backup.agekey
fi
chmod 600 /etc/pocketbase/backup.agekey
cat > /usr/local/sbin/uchu-pocketbase-backup <<'BACKUP'
#!/usr/bin/env bash
set -euo pipefail
umask 077
exec 9>/run/uchu-pocketbase-backup.lock
flock -n 9 || exit 1
systemctl is-active --quiet pocketbase || { echo 'PocketBase must be running before the snapshot'; exit 1; }
python3 - <<'PY'
import shutil
from pathlib import Path
size=sum(p.stat().st_size for p in Path('/var/lib/pocketbase').rglob('*') if p.is_file())
size+=Path('/opt/pocketbase/pocketbase').stat().st_size
if shutil.disk_usage('/var/backups/pocketbase').free < int(size*1.1)+512*1024*1024:
    raise SystemExit('Insufficient free disk space for snapshot; service was not stopped')
PY
recipient=$(age-keygen -y /etc/pocketbase/backup.agekey)
pending=$(mktemp -d /var/backups/pocketbase/.pending-XXXXXX)
cleanup() {
    systemctl start pocketbase
    [[ $pending == /var/backups/pocketbase/.pending-* ]] && rm -rf -- "$pending"
}
trap cleanup EXIT
systemctl stop pocketbase
tar -C / -czf - var/lib/pocketbase etc/pocketbase/pocketbase.env \
    opt/pocketbase/pocketbase opt/pocketbase/pb_hooks opt/pocketbase/pb_migrations \
    etc/systemd/system/pocketbase.service etc/caddy/Caddyfile \
    | age -r "$recipient" -o "$pending/snapshot.age"
archive="/var/backups/pocketbase/uchu-$(date -u +%Y%m%dT%H%M%S%N).age"
mv "$pending/snapshot.age" "$archive"
chmod 600 "$archive"
python3 - <<'PY'
from pathlib import Path
files=sorted(Path('/var/backups/pocketbase').glob('uchu-*.age'))
for path in files[:-3]:path.unlink()
PY
printf 'Encrypted local snapshot: %s\n' "$archive"
BACKUP
chmod 700 /usr/local/sbin/uchu-pocketbase-backup
cat > /usr/local/sbin/uchu-pocketbase-restore-check <<'PY'
#!/usr/bin/env python3
"""Decrypt into a new private directory; never overwrite the live installation."""
import argparse,os,sqlite3,subprocess,tarfile
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--archive',type=Path,required=True);p.add_argument('--to',type=Path,required=True);a=p.parse_args()
if a.to.exists():raise SystemExit('Refusing to overwrite an existing directory')
if not a.archive.is_file():raise SystemExit('Archive not found')
os.umask(0o077);a.to.mkdir(parents=True,mode=0o700)
process=subprocess.Popen(['age','-d','-i','/etc/pocketbase/backup.agekey',str(a.archive)],stdout=subprocess.PIPE)
try:
    with tarfile.open(fileobj=process.stdout,mode='r|gz') as tar:tar.extractall(a.to,filter='data')
finally:process.stdout.close()
if process.wait()!=0:raise SystemExit('Backup decryption failed')
db=a.to/'var/lib/pocketbase/data.db'
with sqlite3.connect('file:'+str(db)+'?mode=ro',uri=True) as c:
    if c.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise SystemExit('Restored database integrity failed')
assert (a.to/'etc/pocketbase/pocketbase.env').stat().st_mode&0o077==0
print('PASS: encrypted archive restored into a new directory; database integrity OK; live service unchanged')
PY
chmod 700 /usr/local/sbin/uchu-pocketbase-restore-check
cat > /etc/systemd/system/uchu-pocketbase-backup.service <<'UNIT'
[Unit]
Description=Encrypted local PocketBase snapshot
After=pocketbase.service
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/uchu-pocketbase-backup
UMask=0077
UNIT
cat > /etc/systemd/system/uchu-pocketbase-backup.timer <<'UNIT'
[Unit]
Description=Daily PocketBase snapshot (02:15 Yekaterinburg)
[Timer]
OnCalendar=*-*-* 21:15:00 UTC
Persistent=true
RandomizedDelaySec=300
[Install]
WantedBy=timers.target
UNIT
chmod 644 /etc/systemd/system/uchu-pocketbase-backup.service /etc/systemd/system/uchu-pocketbase-backup.timer
systemctl daemon-reload
systemctl enable --now uchu-pocketbase-backup.timer
systemctl start uchu-pocketbase-backup.service
python3 - <<'PY'
import json,subprocess,tempfile,time,urllib.request
from pathlib import Path
for attempt in range(30):
    try:
        with urllib.request.urlopen('http://127.0.0.1:8090/api/uchu/auth/v1/health',timeout=2) as r:assert json.load(r)['ok']
        break
    except Exception:
        if attempt==29:raise
        time.sleep(.2)
archive=sorted(Path('/var/backups/pocketbase').glob('uchu-*.age'))[-1]
# The decrypted check stays root-only outside the live database.
folder=Path(tempfile.mkdtemp(prefix='uchu-restore-',dir='/var/backups'))/'verified'
subprocess.run(['/usr/local/sbin/uchu-pocketbase-restore-check','--archive',str(archive),'--to',str(folder)],check=True)
Path('/var/backups/pocketbase/restore-check.ok').write_text(time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())+'\n')
Path('/var/backups/pocketbase/restore-check.ok').chmod(0o600)
print('PASS: local health after backup; encrypted snapshot and fresh-directory restore verified')
PY
echo 'Caddy configured for accounts.uchu-po-frp.ru; real HTTPS still depends on correct DNS.'
echo 'Retention: up to three encrypted local snapshots; an independent off-server copy and key custody are still required.'
