#!/usr/bin/env python3
"""Validate a replacement Google web-client secret before atomically saving it on the VPS."""
import getpass,json,os,re,secrets,stat,subprocess,sys,tempfile,time
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request,urlopen
ENV=Path('/etc/pocketbase/pocketbase.env')
def probe(client_id,secret):
    body=urlencode({'client_id':client_id,'client_secret':secret,'grant_type':'authorization_code','code':'nonexistent-'+secrets.token_urlsafe(32),'code_verifier':secrets.token_urlsafe(48),'redirect_uri':'https://uchu-po-frp.ru/google.html'}).encode()
    try:
        with urlopen(Request('https://oauth2.googleapis.com/token',data=body,headers={'Content-Type':'application/x-www-form-urlencoded'}),timeout=25) as r:status=r.status;value=json.load(r)
    except HTTPError as e:status=e.code;value=json.loads(e.read())
    # A deliberately nonexistent grant must fail after client authentication.
    if status!=400 or value.get('error')!='invalid_grant':raise ValueError('Replacement client credentials were not accepted')
    return {'http_status':status,'provider_error':'invalid_grant','invalid_client_detected':False,'real_user_login_tested':False}
def write_private(path,text):
    fd,tmp=tempfile.mkstemp(prefix='.google-',dir=path.parent)
    try:
        with os.fdopen(fd,'w') as f:os.fchmod(f.fileno(),0o600);f.write(text);f.flush();os.fsync(f.fileno())
        os.replace(tmp,path)
    finally:Path(tmp).unlink(missing_ok=True)
def restart():
    subprocess.run(['systemctl','restart','pocketbase'],check=True,capture_output=True,timeout=30)
    for _ in range(50):
        try:
            with urlopen('http://127.0.0.1:8090/api/uchu/auth/v1/health',timeout=2) as r:
                if json.load(r).get('ok') is True:return
        except OSError:pass
        time.sleep(.2)
    raise RuntimeError('Health failed')
def apply(path,secret):
    info=path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.geteuid() or stat.S_IMODE(info.st_mode)!=0o600:raise ValueError('Private environment required')
    if not re.fullmatch(r'[A-Za-z0-9._~-]{16,512}',secret):raise ValueError('Invalid secret format')
    before=path.read_text();env=dict(x.split('=',1) for x in before.splitlines() if x and not x.startswith('#'))
    if env.get('GOOGLE_CLIENT_ID')!='893595526851-6pm7bgse8emcgv27469ilfc06q41sqic.apps.googleusercontent.com':raise ValueError('Client ID changed; review it first')
    report=probe(env['GOOGLE_CLIENT_ID'],secret)
    if len(re.findall(r'(?m)^GOOGLE_CLIENT_SECRET=',before))!=1:raise ValueError('Expected exactly one existing Google secret')
    replacement=re.sub(r'(?m)^GOOGLE_CLIENT_SECRET=[^\n]*',lambda _: 'GOOGLE_CLIENT_SECRET='+secret,before)
    write_private(path,replacement)
    try:restart()
    except Exception:write_private(path,before);restart();raise
    return report
if __name__=='__main__':
    try:
        if os.geteuid()!=0 or not sys.stdin.isatty():raise ValueError('Use the root terminal')
        os.umask(0o077);print('READY FOR GOOGLE CLIENT SECRET. Input is hidden.',flush=True)
        value=getpass.getpass('GOOGLE CLIENT SECRET (hidden): ');report=apply(ENV,value);del value
        root=Path('/root/uchu-privacy-upgrade');(root/'google-check.json').write_text(json.dumps(report))
        subprocess.run(['systemctl','start','uchu-pocketbase-backup.service'],check=True,capture_output=True,timeout=180)
        result={**report,'secret_saved_after_provider_check':True,'other_configuration_preserved':True,'service_healthy':True,'fresh_encrypted_backup_created':True};(root/'google-refresh.json').write_text(json.dumps(result));print(json.dumps(result))
    except Exception as e:print('Google refresh stopped: '+type(e).__name__+'. No credentials printed.');raise SystemExit(1)
