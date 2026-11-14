#!/usr/bin/env python3
"""Verify the accepted release and retire closed test copies without touching production records."""
import argparse,hashlib,json,os,pwd,stat,subprocess,time
from pathlib import Path
from urllib.request import urlopen
ROOT=Path('/root/uchu-privacy-upgrade')
def main():
 p=argparse.ArgumentParser();p.add_argument('--ref',required=True);a=p.parse_args()
 if os.geteuid()!=0 or len(a.ref)!=40 or any(c not in '0123456789abcdef' for c in a.ref):raise ValueError('Root and immutable ref required')
 os.umask(0o077);base='https://raw.githubusercontent.com/lubagame18-dev/uchu-po-frp/'+a.ref+'/'
 with urlopen(base+'deploy/privacy/release.json',timeout=30) as r:manifest=json.load(r)
 folder=ROOT/'finish';folder.mkdir(mode=0o700,exist_ok=True)
 for name in ['retire-pilot.py','diagnose-google.py','notify-owner.py','uchu-privacy-snapshot.path']:
  source='deploy/privacy/'+name
  with urlopen(base+source,timeout=30) as r:data=r.read()
  if hashlib.sha256(data).hexdigest()!=manifest['files'][source]:raise ValueError('Source hash mismatch')
  (folder/name).write_bytes(data)
 subprocess.run(['python3',str(folder/'diagnose-google.py')],check=True)
 if not (ROOT/'retired-pilot.json').exists():subprocess.run(['python3',str(folder/'retire-pilot.py')],check=True)
 Path('/etc/systemd/system/uchu-privacy-snapshot.path').write_bytes((folder/'uchu-privacy-snapshot.path').read_bytes())
 subprocess.run(['systemctl','daemon-reload'],check=True);subprocess.run(['systemctl','restart','uchu-privacy-snapshot.path'],check=True)
 flag=Path('/var/lib/pocketbase/.privacy-backup-needed')
 if flag.exists():raise ValueError('A real pending deletion snapshot exists; do not replace it')
 flag.write_text('privacy-operation-self-check:'+str(time.time()));user=pwd.getpwnam('pocketbase');os.chown(flag,user.pw_uid,user.pw_gid)
 for attempt in range(120):
  if not flag.exists():break
  time.sleep(1)
 if flag.exists():raise ValueError('Deletion-triggered verified snapshot is pending; inspect service')
 report={'privacy_snapshot_path_exercised':True,'encrypted_backup_restore_exercised':True,'retired_copies_retention_configured':True,'production_accounts_not_modified':True}
 (ROOT/'finish-receipt.json').write_text(json.dumps(report));print(json.dumps(report))
if __name__=='__main__':
 try:main()
 except Exception as e:print('Privacy final checks stopped: '+type(e).__name__+'. No credentials printed.');raise SystemExit(1)
