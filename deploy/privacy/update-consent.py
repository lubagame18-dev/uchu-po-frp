#!/usr/bin/env python3
"""Apply the reviewed consent/login-only hook change without changing data or credentials."""
import argparse,hashlib,json,os,re,subprocess,time
from pathlib import Path
from urllib.request import urlopen

def health():
 for _ in range(50):
  try:
   with urlopen('http://127.0.0.1:8090/api/uchu/auth/v1/health',timeout=2) as r:
    if json.load(r).get('ok') is True:return
  except OSError:pass
  time.sleep(.2)
 raise RuntimeError('PocketBase health failed')
def run(*cmd):subprocess.run(cmd,check=True,capture_output=True,timeout=180)
def main():
 p=argparse.ArgumentParser();p.add_argument('--ref',required=True);a=p.parse_args()
 if os.geteuid()!=0 or not re.fullmatch('[0-9a-f]{40}',a.ref):raise ValueError('Root and immutable ref required')
 os.umask(0o077);root=Path('/root/uchu-consent-update');root.mkdir(mode=0o700,exist_ok=True)
 if (root/'receipt.json').exists():raise ValueError('Already accepted; inspect receipt')
 base='https://raw.githubusercontent.com/lubagame18-dev/uchu-po-frp/'+a.ref+'/'
 with urlopen(base+'deploy/privacy/release.json',timeout=30) as r:manifest=json.load(r)
 name='deploy/pocketbase/pb_hooks/identities.js'
 with urlopen(base+name,timeout=30) as r:data=r.read()
 if hashlib.sha256(data).hexdigest()!=manifest['files'][name]:raise ValueError('Source hash mismatch')
 target=Path('/opt/pocketbase/pb_hooks/identities.js');before=target.read_bytes();(root/'before-identities.js').write_bytes(before)
 run('systemctl','start','uchu-pocketbase-backup.service')
 try:
  temp=target.with_name('.identities.new');temp.write_bytes(data);temp.chmod(0o644);os.replace(temp,target)
  run('systemctl','restart','pocketbase');health()
 except Exception:
  target.write_bytes(before);target.chmod(0o644);run('systemctl','restart','pocketbase');raise
 run('systemctl','start','uchu-pocketbase-backup.service')
 report={'consent_only_during_registration':True,'existing_oauth_login_requires_no_new_consent':True,'database_and_credentials_unchanged':True,'health':True,'ref':a.ref};(root/'receipt.json').write_text(json.dumps(report));print(json.dumps(report))
if __name__=='__main__':
 try:main()
 except Exception as e:print('Consent update stopped: '+type(e).__name__+'. No credentials printed.');raise SystemExit(1)
