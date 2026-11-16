#!/usr/bin/env python3
"""VPS-side Cloud Function update. IAM input hidden; PB service key stays server-to-cloud."""
import argparse,base64,getpass,hashlib,io,json,os,stat,subprocess,time
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request,urlopen
from zipfile import ZipFile,ZipInfo,ZIP_DEFLATED

FUNCTION='d4ek0q8grbhn7q5muf24'
API='https://serverless-functions.api.cloud.yandex.net'
ROOT=Path('/root/uchu-function-deploy')
SOURCE_REF='f36a6523cd9418b3e4f277403351ee04092705cc'
SOURCE_HASHES={"accounts-backend.js":"e6241b71b8a9e7fb76f2e29937fa20a1270c57aa05f17e571f39bfcd4784ccf6","botbrain.js":"e390a29595e9f522698f1c55eda8f6358d1d77dc3a37377585a6c4292baf1d6a","deepseek-pool.js":"5652128791512bdf94cb88be3c36f6e3a8b782ca1ab159cd967df54c7806a532","image-pool.js":"3f43aca9643fcf2f1a3cd224ce8b90c8e84dadffe12acbfe646ae93ee59f1214","maxbot.js":"2eae9e779ec9b8a7bb553fb77910f37a1128e7ac93649b04edff8f9fbed641b8","payments.js":"fb22563f702b44775dd816c8c88296e0ab3869c34e6472025dbd95af596e7096","proxy.js":"588d83e00d36b01b766a32a7708825d1a44f1738699ee2a2da550a641fd97e1d","quota.js":"9fb87a69d1a67cb3b726f7ffd6413fa21be1be5578a9e02b2f1549450571e05e","sms-hook.js":"76a8ceb4872fbf61c376aaa8257159fcb9e540f1a34ab7726516b51071cb19e7","yandex-function.js":"172670eac1f31700be81377ed213c8cf2f3d19380565c8ffb70fe1cc6125ed54"}
ZIP_SHA256='ac6cdc46a61589d6350a54b5b017272154f58f50f3a873d04ed200238a5603f0'
COPY_FIELDS=('runtime','entrypoint','resources','executionTimeout','serviceAccountId','environment','namedServiceAccounts','concurrency','connectivity','secrets','logOptions','storageMounts','asyncInvocationConfig','tmpfsSize','mounts','metadataOptions')
KNOWN=set(COPY_FIELDS)|{'id','functionId','createdAt','status','tags','imageSize','description'}

def private_write(name,value):
    p=ROOT/name;p.write_text(json.dumps(value));p.chmod(0o600)

def request(url,body=None,token=None,headers=None):
    h={'Content-Type':'application/json',**(headers or {})}
    if token:h['Authorization']='Bearer '+token
    try:
        with urlopen(Request(url,data=json.dumps(body).encode() if body is not None else None,headers=h),timeout=45) as r:return r.status,json.load(r)
    except HTTPError as error:
        # Raw vendor errors can contain request values. Keep them private, never print them.
        private_write('last-error.json',{'status':error.code,'body':error.read().decode(errors='replace')})
        raise RuntimeError('Cloud request HTTP '+str(error.code)) from None

def token():
    path=ROOT/'iam.json'
    if path.exists():
        data=json.loads(path.read_text())
        if data['expires']>time.time()+120:return data['token']
    print('READY FOR IAM TOKEN. Input is hidden; no provider keys are requested.',flush=True)
    value=getpass.getpass('IAM TOKEN (hidden): ')
    if not 100<=len(value)<=4096 or any(c.isspace() for c in value):raise ValueError('Invalid IAM token format')
    private_write('iam.json',{'token':value,'expires':time.time()+1800});return value

def latest(bearer):
    _,data=request(API+'/functions/v1/versions:byTag?'+urlencode({'functionId':FUNCTION,'tag':'$latest'}),token=bearer)
    if data.get('functionId')!=FUNCTION or data.get('status')!='ACTIVE' or set(data)-KNOWN:raise ValueError('Unexpected active version')
    return data

def base_body(old):
    if old.get('functionId')!=FUNCTION or old.get('entrypoint')!='yandex-function.handler':raise ValueError('Unexpected function source')
    return {'functionId':FUNCTION,**{k:old[k] for k in COPY_FIELDS if k in old}}

def staged_body(old,archive,env):
    body=base_body(old);body['environment']=dict(body.get('environment',{}))
    if len(env.get('UCHU_SERVICE_TOKEN',''))<32:raise ValueError('Protected PB service key missing')
    body['environment'].update(ACCOUNTS_BACKEND='supabase',POCKETBASE_URL='https://accounts.uchu-po-frp.ru',POCKETBASE_SERVICE_TOKEN=env['UCHU_SERVICE_TOKEN'])
    body['content']=base64.b64encode(archive).decode();body['description']='PocketBase adapter staged; legacy account routing preserved'
    return body

def archive():
    if not SOURCE_HASHES or 'yandex-function.js' not in SOURCE_HASHES or 'accounts-backend.js' not in SOURCE_HASHES:raise ValueError('Source manifest missing')
    buf=io.BytesIO()
    with ZipFile(buf,'w',compression=ZIP_DEFLATED) as z:
        for name,wanted in sorted(SOURCE_HASHES.items()):
            if Path(name).name!=name or not name.endswith('.js'):raise ValueError('Unexpected source filename')
            with urlopen('https://raw.githubusercontent.com/lubagame18-dev/uchu-po-frp/'+SOURCE_REF+'/proxy/'+name,timeout=25) as r:data=r.read()
            if hashlib.sha256(data).hexdigest()!=wanted:raise ValueError('Source checksum mismatch')
            info=ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,data)
    result=buf.getvalue()
    if hashlib.sha256(result).hexdigest()!=ZIP_SHA256:raise ValueError('Archive checksum mismatch')
    p=ROOT/'candidate.zip';p.write_bytes(result);p.chmod(0o600);return result

def wait_operation(operation,bearer,name):
    private_write(name+'-operation.json',operation)
    for n in range(90):
        if operation.get('done'):
            if operation.get('error'):raise RuntimeError('Function version creation failed')
            return operation['response']
        time.sleep(2)
        _,operation=request('https://operation.api.cloud.yandex.net/operations/'+operation['id'],token=bearer)
        private_write(name+'-operation.json',operation)
    raise RuntimeError('Creation still pending; inspect saved operation before another mutation')

def health():
    _,j=request('https://functions.yandexcloud.net/'+FUNCTION+'?path=/health')
    if j.get('ok') is not True:raise ValueError('Function health failed')
    return {k:j.get(k) for k in ('ok','version','pay','payBy','providers','keys','images')}

def rollback(old,bearer):
    body=base_body(old);body['versionId']=old['id'];body['description']='Restore pre-migration code and environment'
    _,op=request(API+'/functions/v1/versions',body,token=bearer)
    restored=wait_operation(op,bearer,'rollback');private_write('rollback-version.json',restored)
    if health()!=json.loads((ROOT/'before-health.json').read_text()):raise RuntimeError('Rollback health differs')
    print(json.dumps({'rolled_back':True,'version':restored['id']}))

def main(action):
    if os.geteuid()!=0:raise ValueError('Run on the VPS as root')
    os.umask(0o077);ROOT.mkdir(mode=0o700,exist_ok=True)
    bearer=token()
    if action=='prepare':
        current=latest(bearer)
        before=ROOT/'before-version.json'
        if before.exists():
            if json.loads(before.read_text())['id']!=current['id']:raise ValueError('Previous snapshot differs; review before overwrite')
        else:private_write('before-version.json',current)
        private_write('before-health.json',health());archive()
        print(json.dumps({'prepared':True,'before_version':current['id'],'source_checksums_verified':True,'archive_sha256_verified':True,'production_changed':False}));return
    old=json.loads((ROOT/'before-version.json').read_text())
    if action=='rollback':rollback(old,bearer);return
    if (ROOT/'deploy-operation.json').exists():raise ValueError('Deployment already attempted; inspect saved operation first')
    if latest(bearer)['id']!=old['id']:raise ValueError('Current function changed since preparation')
    p=ROOT/'candidate.zip';payload=p.read_bytes()
    if hashlib.sha256(payload).hexdigest()!=ZIP_SHA256:raise ValueError('Staged archive changed')
    env=dict(line.split('=',1) for line in Path('/etc/pocketbase/pocketbase.env').read_text().splitlines() if line and not line.startswith('#'))
    body=staged_body(old,payload,env)
    _,op=request(API+'/functions/v1/versions',body,token=bearer)
    current=wait_operation(op,bearer,'deploy');private_write('staged-version.json',current)
    if current.get('status')!='ACTIVE':raise RuntimeError('New version is not active')
    try:
        if health()!=json.loads((ROOT/'before-health.json').read_text()):raise ValueError('Function health changed')
        _,check=request('https://functions.yandexcloud.net/'+FUNCTION+'?path=/admin/accounts-check',headers={'X-Admin-Token':old['environment']['ADMIN_TOKEN']})
        if check.get('ok') is not True or check.get('provider')!='pocketbase' or check.get('serviceAuthenticated') is not True:raise ValueError('Cloud to PocketBase preflight failed')
        private_write('connection-check.json',check)
    except Exception:rollback(old,bearer);raise
    print(json.dumps({'deployed':True,'version':current['id'],'legacy_routing_preserved':True,'existing_environment_preserved':all(current.get('environment',{}).get(k)==v for k,v in old.get('environment',{}).items()),'health_unchanged':True,'cloud_to_pocketbase_verified':True,'production_site_switched':False}))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['prepare','deploy','rollback']);args=parser.parse_args()
    try:main(args.action)
    except Exception as error:
        print('Cloud update paused: '+(str(error) if isinstance(error,(ValueError,RuntimeError)) else type(error).__name__)+'. No credentials printed.')
        raise SystemExit(1)
