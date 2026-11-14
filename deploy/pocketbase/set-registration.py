#!/usr/bin/env python3
"""Toggle email/Google/Yandex registration on the existing VPS; preserve other settings."""
import argparse,json,os,re,subprocess,time
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('mode',choices=('enable','disable'));a=p.parse_args()
    if os.geteuid()!=0:raise SystemExit('Run as root on the VPS')
    os.umask(0o077)
    target=Path('/etc/pocketbase/pocketbase.env');before=target.read_text()
    flags=('UCHU_ALLOW_SIGNUP','UCHU_ALLOW_GOOGLE_SIGNUP','UCHU_ALLOW_YANDEX_SIGNUP')
    enabled=a.mode=='enable';value='true' if enabled else 'false'
    after=before
    for flag in flags:
        pattern=r'^'+flag+r'=.*$'
        if len(re.findall(pattern,after,re.M))!=1:raise SystemExit('Missing or duplicate registration setting')
        after=re.sub(pattern,flag+'='+value,after,flags=re.M)
    def run(*cmd):subprocess.run(cmd,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=180)
    def store(text):
        pending=target.with_suffix('.registration-pending');pending.write_text(text);pending.chmod(0o600);os.replace(pending,target)
    def verify():
        for n in range(30):
            try:
                with urlopen('http://127.0.0.1:8090/api/uchu/auth/v1/health',timeout=3) as r:
                    if json.load(r).get('ok'):break
            except OSError:
                if n==29:raise
                time.sleep(.3)
        # Empty payload proves the gate is open without creating an account or sending mail.
        try:
            urlopen(Request('http://127.0.0.1:8090/api/uchu/auth/v1/signup',data=b'{}',headers={'Content-Type':'application/json'}),timeout=5)
        except HTTPError as e:
            if e.code==(400 if enabled else 503):return
        raise RuntimeError('Registration gate verification failed')
    run('systemctl','start','uchu-pocketbase-backup.service')
    try:
        store(after);run('systemctl','restart','pocketbase');verify()
    except Exception:
        store(before);run('systemctl','restart','pocketbase');raise
    run('systemctl','start','uchu-pocketbase-backup.service')
    print(json.dumps({'registration_enabled':enabled,'methods':['email','google','yandex'],'email_verification_unchanged':True,'other_settings_preserved':True,'backups_created':True,'empty_payload_gate_check_passed':True}))

if __name__=='__main__':main()
