#!/usr/bin/env python3
"""Read-only VPS checks. No account creation, credentials or provider calls."""
import argparse,json,os,sqlite3,stat,subprocess,urllib.request,urllib.error
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--expect-empty',action='store_true');p.add_argument('--require-backup',action='store_true');a=p.parse_args()
if os.geteuid()!=0:raise SystemExit('Run as root on the VPS')
def unit(name,verb):
    r=subprocess.run(['systemctl',verb,name],capture_output=True,text=True)
    return r.returncode==0

def get(path):
    try:
        with urllib.request.urlopen('http://127.0.0.1:8090'+path,timeout=5) as r:return r.status,json.load(r)
    except urllib.error.HTTPError as r:return r.code,None
report={}
report['service_active']=unit('pocketbase','is-active')
report['autostart_enabled']=unit('pocketbase','is-enabled')
code,health=get('/api/uchu/auth/v1/health');report['local_health']=code==200 and health.get('ok') is True and health.get('provider')=='pocketbase'
report['private_lessons_unauthorized']=get('/api/uchu/rest/v1/lessons')[0]==401
report['native_collection_closed']=get('/api/collections/uchu_lessons/records')[0] in (401,403,404)
env_path=Path('/etc/pocketbase/pocketbase.env');report['secrets_mode_600']=stat.S_IMODE(env_path.stat().st_mode)==0o600
env=dict(line.split('=',1) for line in env_path.read_text().splitlines() if line and not line.startswith('#'))
report['server_keys_present']=len(env.get('UCHU_SERVICE_TOKEN',''))>=32 and len(env.get('PB_SETTINGS_KEY',''))==32
report['signup_closed']=env.get('UCHU_ALLOW_SIGNUP')=='false'
report['sms_disabled']=env.get('UCHU_ALLOW_SMS')=='false' and env.get('UCHU_ALLOW_SMS_SIGNUP')=='false'
listeners=subprocess.check_output(['ss','-lnt'],text=True)
report['backend_loopback_only']='127.0.0.1:8090' in listeners and not any(s in listeners for s in ('0.0.0.0:8090','[::]:8090','*:8090'))
with sqlite3.connect('file:/var/lib/pocketbase/data.db?mode=ro',uri=True) as c:
    report['database_integrity']=c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    count=c.execute('SELECT count(*) FROM uchu_users').fetchone()[0]
if a.expect_empty:report['no_test_users_in_production']=count==0
if a.require_backup:
    report['backup_timer_active']=unit('uchu-pocketbase-backup.timer','is-active')
    report['encrypted_snapshot_exists']=bool(list(Path('/var/backups/pocketbase').glob('uchu-*.age')))
    report['initial_restore_verified']=Path('/var/backups/pocketbase/restore-check.ok').is_file()
    report['backup_key_mode_600']=stat.S_IMODE(Path('/etc/pocketbase/backup.agekey').stat().st_mode)==0o600
    report['caddy_active']=unit('caddy','is-active')
    result=subprocess.run(['caddy','validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'],capture_output=True)
    report['caddy_config_valid']=result.returncode==0
print(json.dumps(report,sort_keys=True))
if not all(report.values()):raise SystemExit('One or more server checks failed; no secrets were printed')
print('PASS: server checks. Public HTTPS, SMTP, OAuth and off-server backups need separate acceptance.')
