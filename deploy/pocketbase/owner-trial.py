#!/usr/bin/env python3
"""Promote the sole verified owner and activate the existing function for on-site testing."""
import argparse,hashlib,importlib.util,json,os,shutil,sqlite3,subprocess,time
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request,urlopen

PRIMARY=Path('/var/lib/pocketbase/data.db')
SOURCE=Path('/var/lib/uchu-acceptance/data.db')
ENV=Path('/etc/pocketbase/pocketbase.env')
ROOT=Path('/root/uchu-owner-trial')
RECEIPT=ROOT/'prepared.json'
SETTINGS=('ai_keys','img_keys','site_rules','base_materials','promo_codes','site_admins')

def run(*args):
    r=subprocess.run(args,capture_output=True,timeout=180)
    if r.returncode:raise RuntimeError('Command failed: '+args[0])
    return r.stdout

def private(name,data):
    p=ROOT/name;p.write_text(json.dumps(data));p.chmod(0o600)

def api(url,headers=None,body=None):
    with urlopen(Request(url,headers=headers or {},data=json.dumps(body).encode() if body is not None else None),timeout=35) as r:
        return json.load(r)

def owner(db):
    db.row_factory=sqlite3.Row
    rows=db.execute('SELECT * FROM uchu_users').fetchall()
    if len(rows)!=1 or not rows[0]['verified']:raise ValueError('Exactly one verified test owner required')
    return dict(rows[0])

def promote(source,target):
    """Copy exact auth/profile rows; no password reset, no imported Supabase users."""
    with sqlite3.connect('file:'+str(source)+'?mode=ro',uri=True) as src:account=owner(src)
    with sqlite3.connect('file:'+str(target)+'?mode=rw',uri=True) as dst:
        if dst.execute('SELECT count(*) FROM uchu_users').fetchone()[0]:raise ValueError('Primary accounts must be empty')
        dst.execute('ATTACH DATABASE ? AS owner_source',('file:'+str(source)+'?mode=ro',))
        for table in ('uchu_users','uchu_profiles'):
            cols=lambda schema:[x[1] for x in dst.execute('PRAGMA '+schema+'.table_info('+table+')')]
            if cols('main')!=cols('owner_source'):raise ValueError('Schema mismatch')
        profiles=dst.execute('SELECT key,owner,payload FROM owner_source.uchu_profiles').fetchall()
        if len(profiles)!=1 or profiles[0][0]!=account['id'] or profiles[0][1]!=account['id'] or json.loads(profiles[0][2])['id']!=account['id']:raise ValueError('Unexpected profile ownership')
        if dst.execute('SELECT count(*) FROM uchu_profiles').fetchone()[0]:raise ValueError('Primary profiles must be empty')
        dst.execute('INSERT INTO main.uchu_users SELECT * FROM owner_source.uchu_users')
        dst.execute('INSERT INTO main.uchu_profiles SELECT * FROM owner_source.uchu_profiles')
        dst.commit()
        if owner(dst)!=account:raise ValueError('Auth fields changed')
        if dst.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('Primary integrity failed')
    return account

def values():return dict(x.split('=',1) for x in ENV.read_text().splitlines() if x and not x.startswith('#'))

def configuration(account):
    old=json.loads(Path('/root/uchu-function-deploy/before-version.json').read_text())['environment']
    origin=old['SUPABASE_URL'].rstrip('/')
    if urlsplit(origin).scheme!='https' or not urlsplit(origin).hostname.endswith('.supabase.co'):raise ValueError('Unexpected source')
    headers={'apikey':old['SUPABASE_SERVICE_KEY'],'Authorization':'Bearer '+old['SUPABASE_SERVICE_KEY']}
    result={}
    for table in SETTINGS:
        rows=api(origin+'/rest/v1/'+table+'?select=*',headers)
        if not isinstance(rows,list) or len(rows)>1000:raise ValueError('Unexpected settings size')
        if table=='site_admins':rows=[dict(row,email=account['email'].lower()) for row in rows if str(row.get('email','')).lower()==account['email'].lower()]
        result[table]=rows
    private('settings.json',result);return result

def prepare():
    if RECEIPT.exists():
        r=json.loads(RECEIPT.read_text())
        if r.get('prepared'):print(json.dumps({'already_prepared':True,'owner_preserved':True}));return
    env=values()
    if env.get('UCHU_ALLOW_SIGNUP')!='false':raise ValueError('Primary signup must remain closed')
    headers={'apikey':env['UCHU_SERVICE_TOKEN'],'Content-Type':'application/json'}
    inventory=api('http://127.0.0.1:8090/api/uchu/rest/v1/rpc/migration_inventory',headers,{})
    if inventory['users']!=0 or any(inventory['tables'].values()):raise ValueError('Primary data is not empty')
    with sqlite3.connect('file:'+str(SOURCE)+'?mode=ro',uri=True) as src:
        account=owner(src)
        with sqlite3.connect(ROOT/'owner-source.db') as snap:src.backup(snap)
    settings=configuration(account)
    run('systemctl','start','uchu-pocketbase-backup.service')
    run('systemctl','stop','pocketbase')
    try:
        with sqlite3.connect(PRIMARY) as src,sqlite3.connect(ROOT/'before-primary.db') as dst:src.backup(dst)
        shutil.copyfile(ENV,ROOT/'before.env')
        promote(ROOT/'owner-source.db',PRIMARY)
        env.update(UCHU_ALLOW_SIGNUP='false',UCHU_ALLOW_GOOGLE='true',UCHU_ALLOW_YANDEX='true',UCHU_ALLOW_GOOGLE_SIGNUP='false',UCHU_ALLOW_YANDEX_SIGNUP='false')
        ENV.write_text(''.join(k+'='+v+'\n' for k,v in env.items()));ENV.chmod(0o600)
    except Exception:
        if (ROOT/'before-primary.db').exists():shutil.copyfile(ROOT/'before-primary.db',PRIMARY)
        if (ROOT/'before.env').exists():shutil.copyfile(ROOT/'before.env',ENV)
        raise
    finally:run('systemctl','start','pocketbase')
    for n in range(30):
        try:
            if api('http://127.0.0.1:8090/api/uchu/auth/v1/health')['ok']:break
        except Exception:
            if n==29:raise
            time.sleep(.2)
    for table,rows in settings.items():
        if rows:api('http://127.0.0.1:8090/api/uchu/rest/v1/'+table,headers,{'rows':rows})
    after=api('http://127.0.0.1:8090/api/uchu/rest/v1/rpc/migration_inventory',headers,{})
    if after['users']!=1 or after['tables']['profiles']!=1:raise ValueError('Owner count mismatch')
    for table,rows in settings.items():
        if after['tables'][table]!=len(rows):raise ValueError('Settings count mismatch')
    run('systemctl','start','uchu-pocketbase-backup.service')
    run('/usr/local/sbin/uchu-pocketbase-restore-s3-check')
    result={'prepared':True,'owner_auth_fields_preserved':True,'verified_owner_count':1,'registration_closed':True,'oauth_signup_closed':True,'settings_counts':{t:len(v) for t,v in settings.items()},'encrypted_backup_and_restore_passed':True,'at':int(time.time())}
    private('prepared.json',result);print(json.dumps(result))

def cloud():
    p=Path('/root/uchu-cloud-version.py')
    expected='7a6d8b5fd75f9aa48b6718d1652a162691d90f936aa1ddf5cb01e0a6a59ca68f'
    present=hashlib.sha256(p.read_bytes()).hexdigest()
    if present=='4e51d443ff0fed5a594b9f962155ae3426ad00699c1caac697dfaae2dcfdd229':
        with urlopen('https://raw.githubusercontent.com/lubagame18-dev/uchu-po-frp/fdcb0d6a1ca9e95a86063548d58c230762bc9b65/deploy/pocketbase/cloud-version.py',timeout=30) as r:data=r.read()
        if hashlib.sha256(data).hexdigest()!=expected:raise ValueError('Cloud helper checksum mismatch')
        pending=ROOT/'cloud-version.py';pending.write_bytes(data);pending.chmod(0o700);os.replace(pending,p)
    elif present!=expected:raise ValueError('Unexpected cloud helper')
    spec=importlib.util.spec_from_file_location('cloud',p);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def activate():
    receipt=json.loads(RECEIPT.read_text())
    if receipt.get('prepared') is not True or values().get('UCHU_ALLOW_SIGNUP')!='false':raise ValueError('Owner preparation missing')
    c=cloud();bearer=c.token();before=c.latest(bearer)
    if before['id']!=json.loads((c.ROOT/'staged-version.json').read_text())['id']:raise ValueError('Function changed since verified staging')
    if (ROOT/'activate-operation.json').exists():raise ValueError('Activation already attempted; inspect receipt')
    private('before-function.json',before)
    baseline=api('https://functions.yandexcloud.net/'+c.FUNCTION+'?path=/health')
    body=c.base_body(before);body['environment']=dict(before['environment']);body['environment']['ACCOUNTS_BACKEND']='pocketbase';body['versionId']=before['id'];body['description']='Owner testing on main site; public signup closed'
    _,op=c.request(c.API+'/functions/v1/versions',body,token=bearer);private('activate-operation.json',op)
    current=c.wait_operation(op,bearer,'owner-activate');private('active-function.json',current)
    try:
        health=api('https://functions.yandexcloud.net/'+c.FUNCTION+'?path=/health')
        for key in ('ok','pay','payBy','providers','keys','images','deepseek'):
            if health.get(key)!=baseline.get(key):raise ValueError('Provider readiness changed')
        probe=api('https://functions.yandexcloud.net/'+c.FUNCTION+'?path=/admin/accounts-check',{'X-Admin-Token':before['environment']['ADMIN_TOKEN']})
        if probe.get('serviceAuthenticated') is not True or probe.get('users')!=1:raise ValueError('Primary owner probe failed')
    except Exception:c.rollback(before,bearer);raise
    print(json.dumps({'activated':True,'version':current['id'],'owner_testing':True,'public_signup':False,'providers_preserved':True,'primary_owner_verified':True}))

def close_pilot():
    current=Path('/etc/caddy/Caddyfile');expected=Path('/opt/uchu-acceptance/installed-proxy-sha256').read_text()
    if hashlib.sha256(current.read_bytes()).hexdigest()!=expected:raise ValueError('Proxy changed; preserve it for review')
    original=Path('/etc/caddy/Caddyfile.before-acceptance').read_text()
    lines=original.splitlines()
    for i,line in enumerate(lines):
        if '@private not path ' in line:lines[i]=line+' /check/*'
    text='\n'.join(lines)+'\n';text=text.replace('    respond @private 404','    redir /check/* https://uchu-po-frp.ru/ 302\n    respond @private 404',1)
    stage=ROOT/'Caddyfile';stage.write_text(text);stage.chmod(0o644)
    run('caddy','validate','--config',str(stage),'--adapter','caddyfile')
    current.write_text(text);current.chmod(0o644);run('systemctl','reload','caddy')
    run('systemctl','stop','uchu-acceptance-web.service','uchu-acceptance-backend.service')
    Path('/run/uchu-acceptance-link').unlink(missing_ok=True)
    Path('/etc/pocketbase/acceptance.json').unlink(missing_ok=True)
    print(json.dumps({'pilot_closed':True,'old_check_url_redirects_to_main':True,'old_database_retained':True}))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['prepare','auth','activate','close-pilot','rollback-function']);a=p.parse_args()
    try:
        if os.geteuid()!=0:raise ValueError('Root required')
        os.umask(0o077);ROOT.mkdir(mode=0o700,exist_ok=True)
        if a.action=='prepare':prepare()
        elif a.action=='auth':cloud().token();print('Cloud session ready; function unchanged.')
        elif a.action=='activate':activate()
        elif a.action=='close-pilot':close_pilot()
        else:
            c=cloud();c.rollback(json.loads((ROOT/'before-function.json').read_text()),c.token())
    except Exception as error:
        print('Owner testing paused: '+type(error).__name__+'. No account data or credentials printed.')
        raise SystemExit(1)
