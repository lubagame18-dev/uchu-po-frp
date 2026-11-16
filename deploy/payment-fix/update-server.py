#!/usr/bin/env python3
"""Verify a real database copy, then install the reviewed account-balance release."""
import argparse,hashlib,json,os,re,shutil,sqlite3,subprocess,time,traceback
from pathlib import Path
from urllib.request import urlopen

ROOT=Path('/root/uchu-payment-fix-final-release');KIT=Path('/opt/pocketbase');DATA=Path('/var/lib/pocketbase');ENV=Path('/etc/pocketbase/pocketbase.env')
BASE='https://raw.githubusercontent.com/lubagame18-dev/uchu-po-frp/'
def run(*args):
    r=subprocess.run(args,capture_output=True,timeout=240)
    if r.returncode:raise RuntimeError('Command failed: '+args[0])
def fetch(ref,name):
    with urlopen(BASE+ref+'/'+name,timeout=35) as r:return r.read()
def probe(port,version):
    for _ in range(80):
        try:
            with urlopen('http://127.0.0.1:'+str(port)+'/api/uchu/privacy/v1/status',timeout=3) as r:
                if json.load(r).get('version')==version:return
        except OSError:pass
        time.sleep(.25)
    raise RuntimeError('Account health/version check failed')
def inventory(database):
    with sqlite3.connect('file:'+str(database)+'?mode=ro',uri=True) as c:
        if c.execute('pragma integrity_check').fetchone()[0]!='ok':raise RuntimeError('Database integrity failed')
        profiles={k:json.loads(p) for k,p in c.execute('select key,payload from uchu_profiles')}
        paid={owner for owner,p in c.execute('select owner,payload from uchu_payments') if json.loads(p).get('status')=='paid'}
        paid|={k for k,p in profiles.items() if p.get('plan') not in ('free','none',None) or p.get('ai_left',0)>2 or p.get('tokens_limit',0)>80000}
        return {'users':set(x[0] for x in c.execute('select id from uchu_users')),'lessons':dict(c.execute('select key,payload from uchu_lessons')),'profiles':profiles,'paid':paid}
def verify(before,after):
    if not before['users']<=after['users'] or any(after['lessons'].get(k)!=v for k,v in before['lessons'].items()):raise RuntimeError('Account/material preservation failed')
    for key in before['paid']:
        old=before['profiles'].get(key);new=after['profiles'].get(key)
        if old and (not new or any(old.get(f)!=new.get(f) for f in ('ai_left','tokens_limit','tokens_used','paid_until'))):raise RuntimeError('Paid credit preservation failed')
    for p in after['profiles'].values():
        if p.get('plan')=='free':raise RuntimeError('Legacy trial grant still present')
def main():
    p=argparse.ArgumentParser();p.add_argument('--ref',required=True);a=p.parse_args()
    if os.geteuid()!=0 or not re.fullmatch('[0-9a-f]{40}',a.ref):raise ValueError('Use root and an immutable commit')
    os.umask(0o077);ROOT.mkdir(mode=0o700,exist_ok=True)
    if (ROOT/'receipt.json').exists():raise RuntimeError('Release already installed; inspect receipt')
    manifest=json.loads(fetch(a.ref,'deploy/payment-fix/release.json'));(ROOT/'release.json').write_text(json.dumps(manifest));stage=ROOT/'stage'
    for folder in ('pb_hooks','pb_migrations'):shutil.copytree(KIT/folder,stage/folder,dirs_exist_ok=True)
    for name,wanted in manifest['files'].items():
        path=Path(name)
        if '..' in path.parts or path.parent.as_posix() not in ('deploy/pocketbase/pb_hooks','deploy/pocketbase/pb_migrations'):raise ValueError('Unexpected release file')
        value=fetch(a.ref,name)
        if hashlib.sha256(value).hexdigest()!=wanted:raise ValueError('Source checksum mismatch')
        (stage/path.parent.name/path.name).write_bytes(value)
    ledger=fetch(a.ref,'deploy/privacy/ledger.py')
    if hashlib.sha256(ledger).hexdigest()!=manifest['privacy_ledger_sha256']:raise ValueError('Privacy ledger checksum mismatch')
    (stage/'ledger.py').write_bytes(ledger)
    print(json.dumps({'phase':'source_hashes_verified','files':len(manifest['files'])}),flush=True)
    original_env=ENV.read_bytes();env=dict(line.split('=',1) for line in original_env.decode().splitlines() if line and not line.startswith('#'))
    run('systemctl','start','uchu-pocketbase-backup.service')
    cloned=ROOT/'staged-data';cloned.mkdir(exist_ok=True)
    try:
        with sqlite3.connect('file:'+str(DATA/'data.db')+'?mode=ro',uri=True) as src,sqlite3.connect(cloned/'data.db') as dst:src.backup(dst)
        before=inventory(cloned/'data.db')
        with (ROOT/'stage.log').open('wb') as log:
            proc=subprocess.Popen([str(KIT/'pocketbase'),'serve','--dir='+str(cloned),'--hooksDir='+str(stage/'pb_hooks'),'--migrationsDir='+str(stage/'pb_migrations'),'--http=127.0.0.1:8093','--hooksWatch=false','--encryptionEnv=PB_SETTINGS_KEY'],env=dict(os.environ,**env),stdout=log,stderr=log)
            try:probe(8093,manifest['version']);verify(before,inventory(cloned/'data.db'))
            finally:proc.terminate();proc.wait(timeout=20)
    finally:shutil.rmtree(cloned)
    print(json.dumps({'phase':'real_database_copy_verified','users':len(before['users']),'paid_profiles':len(before['paid'])}),flush=True)
    with urlopen('http://127.0.0.1:8090/api/uchu/privacy/v1/status',timeout=5) as r:old_version=json.load(r)['version']
    for folder in ('pb_hooks','pb_migrations'):shutil.copytree(KIT/folder,ROOT/('before-'+folder),dirs_exist_ok=True)
    run('systemctl','stop','pocketbase')
    try:
        before_live=inventory(DATA/'data.db')
        for name in manifest['files']:
            path=Path(name);dest=KIT/path.parent.name/path.name;shutil.copyfile(stage/path.parent.name/path.name,dest);dest.chmod(0o644)
        run('systemctl','start','pocketbase');probe(8090,manifest['version']);verify(before_live,inventory(DATA/'data.db'))
        if ENV.read_bytes()!=original_env:raise RuntimeError('Credential configuration changed')
    except Exception:
        run('systemctl','stop','pocketbase')
        for folder in ('pb_hooks','pb_migrations'):
            shutil.rmtree(KIT/folder);shutil.copytree(ROOT/('before-'+folder),KIT/folder)
        run('systemctl','start','pocketbase');probe(8090,old_version)
        # Keep live data and additive columns; never restore an old user database.
        raise
    shutil.copyfile(stage/'ledger.py','/usr/local/sbin/uchu-privacy-ledger');os.chmod('/usr/local/sbin/uchu-privacy-ledger',0o700)
    run('systemctl','start','uchu-pocketbase-backup.service');run('/usr/local/sbin/uchu-pocketbase-restore-s3-check')
    result={'installed':True,'ref':a.ref,'users_preserved':len(before_live['users']),'paid_balances_preserved':True,'materials_preserved':True,'credentials_unchanged':True,'real_database_copy_verified':True,'encrypted_backup_and_s3_restore_verified':True,'health_version':manifest['version']}
    (ROOT/'receipt.json').write_text(json.dumps(result));print(json.dumps(result))
if __name__=='__main__':
    try:main()
    except Exception:
        if ROOT.exists():(ROOT/'failure.log').write_text(traceback.format_exc())
        print('Balance release stopped. Inspect the private server failure.log; no credentials printed.');raise SystemExit(1)
