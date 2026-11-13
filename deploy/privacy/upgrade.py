#!/usr/bin/env python3
"""Stage, verify and install only the reviewed privacy/account kit on the existing VPS."""
import argparse,hashlib,json,os,pwd,re,shutil,sqlite3,subprocess,tempfile,time
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
BASE='https://raw.githubusercontent.com/lubagame18-dev/uchu-po-frp/'
ROOT=Path('/root/uchu-privacy-upgrade');DATA=Path('/var/lib/pocketbase');KIT=Path('/opt/pocketbase');ENV=Path('/etc/pocketbase/pocketbase.env')
def run(*cmd):
    r=subprocess.run(cmd,capture_output=True,timeout=240)
    if r.returncode:raise RuntimeError('Command failed: '+cmd[0])
    return r.stdout
def fetch(ref,name):
    with urlopen(BASE+ref+'/'+name,timeout=35) as r:return r.read()
def probe(port):
    for n in range(60):
        try:
            with urlopen('http://127.0.0.1:'+str(port)+'/api/uchu/privacy/v1/status',timeout=3) as r:
                value=json.load(r)
                if value['version']=='2026-11-13':return
        except (OSError,KeyError):time.sleep(.3)
    raise RuntimeError('Privacy backend did not become healthy')
def main():
    p=argparse.ArgumentParser();p.add_argument('--ref',required=True);a=p.parse_args()
    if os.geteuid()!=0 or not re.fullmatch('[0-9a-f]{40}',a.ref):raise ValueError('Run as root with an immutable commit')
    os.umask(0o077);ROOT.mkdir(mode=0o700,exist_ok=True)
    if (ROOT/'receipt.json').exists():raise RuntimeError('Upgrade already accepted; inspect the receipt instead of reapplying')
    manifest=json.loads(fetch(a.ref,'deploy/privacy/release.json'));print(json.dumps({'phase':'download_verified_release','files':len(manifest['files'])}),flush=True);(ROOT/'release.json').write_text(json.dumps(manifest));stage=ROOT/'stage';stage.mkdir(exist_ok=True)
    for name,expected in manifest['files'].items():
        if not name.startswith(('deploy/pocketbase/pb_hooks/','deploy/pocketbase/pb_migrations/','deploy/privacy/')) or '..' in Path(name).parts:raise ValueError('Unexpected release path')
        value=fetch(a.ref,name)
        if hashlib.sha256(value).hexdigest()!=expected:raise ValueError('Release checksum mismatch')
        target=stage/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(value)
    print(json.dumps({'phase':'release_hashes_verified'}),flush=True)
    before=ENV.read_text();env=dict(line.split('=',1) for line in before.splitlines() if line and not line.startswith('#'))
    if not env.get('UCHU_PRIVACY_HMAC_KEY'):env['UCHU_PRIVACY_HMAC_KEY']=os.urandom(32).hex()
    if len(env['UCHU_PRIVACY_HMAC_KEY'])<32:raise ValueError('Invalid privacy key')
    run('systemctl','start','uchu-pocketbase-backup.service')
    cloned=ROOT/'staged-data'
    if cloned.exists():shutil.rmtree(cloned)
    cloned.mkdir()
    with sqlite3.connect('file:'+str(DATA/'data.db')+'?mode=ro',uri=True) as src,sqlite3.connect(cloned/'data.db') as dst:
        src.backup(dst);before_users=src.execute('select count(*) from uchu_users').fetchone()[0]
    hooks=stage/'deploy/pocketbase/pb_hooks';migrations=stage/'deploy/pocketbase/pb_migrations'
    # Validate the real migrated copy before changing the live hooks. Nothing is sent to users.
    stage_log=(ROOT/'stage.log').open('wb')
    proc=subprocess.Popen([str(KIT/'pocketbase'),'serve','--dir='+str(cloned),'--hooksDir='+str(hooks),'--migrationsDir='+str(migrations),'--http=127.0.0.1:8093','--hooksWatch=false','--encryptionEnv=PB_SETTINGS_KEY'],env=dict(os.environ,**env),stdout=stage_log,stderr=stage_log)
    try:probe(8093)
    finally:proc.terminate();proc.wait(timeout=20);stage_log.close();shutil.rmtree(cloned)
    print(json.dumps({'phase':'staged_migration_verified','original_users':before_users}),flush=True)
    for folder in ['pb_hooks','pb_migrations']:shutil.copytree(KIT/folder,ROOT/('before-'+folder),dirs_exist_ok=True)
    (ROOT/'before.env').write_text(before)
    run('systemctl','stop','pocketbase')
    try:
        for folder in ['pb_hooks','pb_migrations']:
            for path in (stage/'deploy/pocketbase'/folder).glob('*.js'):
                target=KIT/folder/path.name;shutil.copyfile(path,target);target.chmod(0o644)
        ENV.write_text(''.join(k+'='+v+'\n' for k,v in env.items()));ENV.chmod(0o600)
        run('systemctl','start','pocketbase');probe(8090)
    except Exception:
        # Keep additive migrations/data; never roll a live user's records back to an older snapshot.
        run('systemctl','stop','pocketbase')
        shutil.rmtree(KIT/'pb_hooks');shutil.copytree(ROOT/'before-pb_hooks',KIT/'pb_hooks')
        run('systemctl','start','pocketbase');raise
    with sqlite3.connect('file:'+str(DATA/'data.db')+'?mode=ro',uri=True) as c:
        users=c.execute('select count(*) from uchu_users').fetchone()[0]
        if users<before_users or c.execute('pragma integrity_check').fetchone()[0]!='ok':raise RuntimeError('Account inventory check failed')
        claims=c.execute('select count(*) from uchu_trial_claims').fetchone()[0]
    shutil.copyfile(stage/'deploy/privacy/restore-check.py','/usr/local/sbin/uchu-pocketbase-restore-check');os.chmod('/usr/local/sbin/uchu-pocketbase-restore-check',0o700)
    shutil.copyfile(stage/'deploy/privacy/ledger.py','/usr/local/sbin/uchu-privacy-ledger');os.chmod('/usr/local/sbin/uchu-privacy-ledger',0o700)
    # All prepared restores carry a marker; Systemd refuses to open them until the signed ledger is applied.
    unit=Path('/etc/systemd/system/pocketbase.service');text=unit.read_text();(ROOT/'before-service').write_text(text)
    guard='ExecStartPre=/usr/bin/test ! -f /var/lib/pocketbase/.privacy-review-required'
    if guard not in text:unit.write_text(text.replace('[Service]','[Service]\n'+guard,1))
    backup_drop=Path('/etc/systemd/system/uchu-pocketbase-backup.service.d');backup_drop.mkdir(exist_ok=True)
    (backup_drop/'privacy.conf').write_text('[Service]\nExecStartPre=/usr/local/sbin/uchu-privacy-ledger export --database /var/lib/pocketbase/data.db --key-file /etc/pocketbase/pocketbase.env --ledger /var/lib/pocketbase/.privacy-ledger.json\n')
    shutil.copyfile(stage/'deploy/privacy/snapshot-after-delete.sh','/usr/local/sbin/uchu-privacy-snapshot');os.chmod('/usr/local/sbin/uchu-privacy-snapshot',0o700)
    for name in ['uchu-privacy-snapshot.service','uchu-privacy-snapshot.path']:
        dest=Path('/etc/systemd/system')/name;shutil.copyfile(stage/'deploy/privacy'/name,dest);dest.chmod(0o644)
    run('systemctl','daemon-reload');run('systemctl','enable','--now','uchu-privacy-snapshot.path')
    run('systemctl','start','uchu-pocketbase-backup.service');run('/usr/local/sbin/uchu-pocketbase-restore-s3-check')
    result={'installed':True,'ref':a.ref,'users_preserved':True,'user_count':users,'trial_claim_count':claims,'real_database_migrated_in_staging_first':True,'privacy_health':True,'signed_ledger_in_backup':True,'encrypted_backup_and_restore_check':True}
    (ROOT/'receipt.json').write_text(json.dumps(result));print(json.dumps(result))
if __name__=='__main__':
    try:main()
    except Exception as e:
        print('Privacy upgrade stopped: '+type(e).__name__+'. Inspect private server logs; no credentials printed.');raise SystemExit(1)
