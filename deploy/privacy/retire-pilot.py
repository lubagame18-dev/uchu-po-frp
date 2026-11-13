#!/usr/bin/env python3
"""Retire the stopped acceptance database with a verified encrypted 30-day rollback copy."""
import hashlib,io,json,os,shutil,subprocess,tarfile,time
from pathlib import Path

def main():
 if os.geteuid()!=0:raise ValueError('Run as root on the existing VPS')
 os.umask(0o077);root=Path('/root/uchu-privacy-upgrade');receipt=root/'retired-pilot.json'
 if receipt.exists():raise ValueError('Already retired; inspect receipt')
 for name in ['uchu-acceptance-web','uchu-acceptance-backend']:
  r=subprocess.run(['systemctl','is-active',name],capture_output=True,text=True)
  if r.stdout.strip()!='inactive':raise ValueError('Pilot must be stopped before retirement')
 paths=[p for p in [Path('/var/lib/uchu-acceptance'),Path('/root/uchu-owner-trial')] if p.exists()]
 if not paths:raise ValueError('No known retired copies; inspect without guessing')
 for path in paths:
  for f in path.rglob('*'):
   if f.is_symlink():raise ValueError('Symlink in pilot; inspect before retirement')
 if sum(f.stat().st_size for p in paths for f in p.rglob('*') if f.is_file())>32*1024*1024:raise ValueError('Unexpected pilot size')
 buf=io.BytesIO()
 with tarfile.open(fileobj=buf,mode='w:gz') as tar:
  for path in paths:tar.add(path,arcname=str(path).lstrip('/'))
 raw=buf.getvalue();wanted=hashlib.sha256(raw).digest()
 recipient=subprocess.run(['age-keygen','-y','/etc/pocketbase/backup.agekey'],check=True,capture_output=True,text=True).stdout.strip()
 archive=Path('/var/backups/pocketbase/retired-pilot-'+str(int(time.time()))+'.age')
 result=subprocess.run(['age','-r',recipient,'-o',str(archive)],input=raw,capture_output=True)
 if result.returncode:raise ValueError('Encryption failed; pilot is unchanged')
 restored=subprocess.run(['age','-d','-i','/etc/pocketbase/backup.agekey',str(archive)],capture_output=True)
 if restored.returncode or hashlib.sha256(restored.stdout).digest()!=wanted:raise ValueError('Archive verification failed; pilot is unchanged')
 # Reversible: exact stopped copies only, after byte-for-byte decrypt verification.
 for path in paths:shutil.rmtree(path)
 for name in ['uchu-acceptance-web','uchu-acceptance-backend']:subprocess.run(['systemctl','disable',name],check=True,capture_output=True)
 cleaner=Path('/etc/systemd/system/uchu-retired-pilot-cleanup.service');cleaner.write_text('[Unit]\nDescription=Expire verified retired pilot archive after 30 days\n[Service]\nType=oneshot\nExecStart=/usr/bin/find /var/backups/pocketbase -maxdepth 1 -type f -name retired-pilot-*.age -mtime +29 -delete\n')
 Path('/etc/systemd/system/uchu-retired-pilot-cleanup.timer').write_text('[Unit]\nDescription=Daily retired pilot retention\n[Timer]\nOnCalendar=daily\nPersistent=true\n[Install]\nWantedBy=timers.target\n')
 subprocess.run(['systemctl','daemon-reload'],check=True);subprocess.run(['systemctl','enable','--now','uchu-retired-pilot-cleanup.timer'],check=True,capture_output=True)
 result={'retired_pilot_encrypted_archive_verified':True,'plaintext_test_copies_removed':True,'retention_days':30,'production_database_unchanged':True,'old_supabase_unchanged':True};receipt.write_text(json.dumps(result));print(json.dumps(result))
if __name__=='__main__':
 try:main()
 except Exception as e:print('Pilot retirement stopped: '+type(e).__name__+'. No credentials printed.');raise SystemExit(1)
