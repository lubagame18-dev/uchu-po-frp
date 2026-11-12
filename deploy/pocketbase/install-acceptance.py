#!/usr/bin/env python3
"""Run on the existing VPS after reviewing/pinning this file. Never changes production flags/data."""
import hashlib,json,os,pwd,secrets,shutil,sqlite3,subprocess,time,urllib.request
from pathlib import Path

ROOT=Path('/opt/uchu-acceptance')
DATA=Path('/var/lib/uchu-acceptance')
ENV=Path('/etc/pocketbase/acceptance.env')
SOURCE=Path('/var/lib/pocketbase/data.db')
# Filled from the exact source commit after local acceptance tests.
REF='560c293064128db3f5f62c07447824a9fe8ccdca'
HASHES={"acceptance.html":"b671962a014628909e5dca1e0fc59760c8bf990d72f34dfba42729cf9a00f6be","acceptance.js":"edd4cd49bc7ca3a4a85db4ff2cf2600d82f5eb3aa3aab2316ee3d73364660a3d","acceptance-server.py":"a2764b2f7192edde5171eb4a07a11af33a86dd5d1087a31a16a604a0fb789d11","acceptance-bootstrap.pb.js":"6896e8e8035f02b62708a57b5b6cfc0380588cfb4698db135445ec42524ecd28"}

def run(*args):
    r=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60)
    if r.returncode:raise RuntimeError('Installation command failed: '+args[0])
    return r.stdout.decode()

def install():
    if os.geteuid()!=0:raise ValueError('Root required')
    os.umask(0o077)
    run('systemctl','is-active','pocketbase');run('systemctl','is-active','caddy')
    if ENV.exists() or DATA.exists():raise ValueError('Acceptance already exists; preserve it, do not overwrite')
    if subprocess.run(['systemctl','is-active','--quiet','uchu-backup-web.service']).returncode==0:raise ValueError('Close key entry first')
    caddy=Path('/etc/caddy/Caddyfile');original=caddy.read_text()
    if 'uchu-pocketbase-managed' not in original or 'handle /check/' in original or 'private-backup-setup' in original:raise ValueError('Unexpected proxy state')
    src_env=dict(line.split('=',1) for line in Path('/etc/pocketbase/pocketbase.env').read_text().splitlines() if line and not line.startswith('#'))
    if src_env.get('UCHU_ALLOW_SIGNUP')!='false':raise ValueError('Expected closed production signup')
    with sqlite3.connect('file:'+str(SOURCE)+'?mode=ro',uri=True) as db:
        if db.execute('SELECT count(*) FROM uchu_users').fetchone()[0]!=0:raise ValueError('Never copy existing user accounts to acceptance')
        if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('Source integrity failed')
    ROOT.mkdir(mode=0o755,parents=True,exist_ok=True)
    ROOT.chmod(0o755)
    for name,wanted in HASHES.items():
        content=urllib.request.urlopen('https://raw.githubusercontent.com/lubagame18-dev/uchu-po-frp/'+REF+'/deploy/pocketbase/'+name,timeout=30).read()
        if hashlib.sha256(content).hexdigest()!=wanted:raise ValueError('Source checksum mismatch')
        target=ROOT/name;target.write_bytes(content);target.chmod(0o644)
    if set(HASHES)!={'acceptance.html','acceptance.js','acceptance-server.py','acceptance-bootstrap.pb.js'}:raise ValueError('Incomplete source manifest')
    shutil.copytree('/opt/pocketbase/pb_hooks',ROOT/'hooks')
    shutil.copy(ROOT/'acceptance-bootstrap.pb.js',ROOT/'hooks'/'zz-acceptance.pb.js')
    for folder,dirs,files in os.walk(ROOT/'hooks'):
        Path(folder).chmod(0o755)
        for name in files:(Path(folder)/name).chmod(0o644)
    DATA.mkdir(mode=0o700)
    with sqlite3.connect('file:'+str(SOURCE)+'?mode=ro',uri=True) as src,sqlite3.connect(DATA/'data.db') as dest:src.backup(dest)
    account=pwd.getpwnam('pocketbase')
    for p in [DATA,*DATA.iterdir()]:os.chown(p,account.pw_uid,account.pw_gid)
    values=dict(src_env,UCHU_ACCEPTANCE='true',UCHU_SITE_ORIGIN='https://accounts.uchu-po-frp.ru',UCHU_SERVICE_TOKEN=secrets.token_hex(32),UCHU_MAIL_MAX32D='15')
    for flag in ['UCHU_ALLOW_SIGNUP','UCHU_ALLOW_GOOGLE','UCHU_ALLOW_GOOGLE_SIGNUP','UCHU_ALLOW_YANDEX','UCHU_ALLOW_YANDEX_SIGNUP']:values[flag]='true'
    ENV.write_text(''.join(k+'='+v+'\n' for k,v in values.items()));ENV.chmod(0o600)
    backend='''[Unit]
Description=Isolated Uchu account acceptance database
After=network-online.target
[Service]
User=pocketbase
Group=pocketbase
EnvironmentFile=/etc/pocketbase/acceptance.env
ExecStart=/opt/pocketbase/pocketbase serve --http=127.0.0.1:8092 --dir=/var/lib/uchu-acceptance --hooksDir=/opt/uchu-acceptance/hooks --migrationsDir=/opt/pocketbase/pb_migrations --hooksWatch=false --encryptionEnv=PB_SETTINGS_KEY
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/uchu-acceptance
MemoryMax=192M
'''
    proxy='''[Unit]
Description=Owner-only Uchu acceptance page
After=uchu-acceptance-backend.service
[Service]
ExecStart=/usr/bin/python3 /opt/uchu-acceptance/acceptance-server.py serve
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/uchu-acceptance
MemoryMax=96M
'''
    for name,body in [('backend',backend),('web',proxy)]:
        p=Path('/etc/systemd/system/uchu-acceptance-'+name+'.service');p.write_text(body);p.chmod(0o644)
    run('systemctl','daemon-reload');run('systemctl','start','uchu-acceptance-backend.service')
    for n in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:8092/api/uchu/auth/v1/health',timeout=2) as r:assert r.status==200
            break
        except Exception:
            if n==29:raise RuntimeError('Acceptance backend did not become healthy')
            time.sleep(.2)
    run('/usr/bin/python3',str(ROOT/'acceptance-server.py'),'link')
    run('systemctl','start','uchu-acceptance-web.service')
    paths='/check/* /google.html /yandex.html /api/check/*'
    lines=original.splitlines()
    for i,line in enumerate(lines):
        if '@private not path ' in line:lines[i]=line+' '+paths
    modified='\n'.join(lines)+'\n'
    anchor='    reverse_proxy 127.0.0.1:8090 {'
    if modified.count(anchor)!=1:raise ValueError('Unexpected proxy layout')
    modified=modified.replace(anchor,'    handle /check/* /google.html /yandex.html /api/check/* {\n        reverse_proxy 127.0.0.1:8091\n    }\n'+anchor)
    staged=ROOT/'Caddyfile';staged.write_text(modified);staged.chmod(0o644)
    run('caddy','validate','--config',str(staged),'--adapter','caddyfile')
    backup=Path('/etc/caddy/Caddyfile.before-acceptance');backup.write_text(original);backup.chmod(0o600)
    (ROOT/'installed-proxy-sha256').write_text(hashlib.sha256(modified.encode()).hexdigest())
    caddy.write_text(modified);caddy.chmod(0o644)
    try:run('systemctl','reload','caddy')
    except Exception:
        caddy.write_text(original);run('systemctl','reload','caddy');raise
    print(json.dumps({'installed':True,'isolated_database':True,'production_flags_unchanged':True,'link_file':'/run/uchu-acceptance-link'}))

if __name__=='__main__':
    try:install()
    except Exception as error:
        print('Acceptance installation paused: '+type(error).__name__+'. No credentials printed.')
        raise SystemExit(1)
