#!/usr/bin/env python3
"""Decrypt a trusted snapshot into a new private directory; block production start until ledger review."""
import argparse,hashlib,hmac,importlib.util,json,os,sqlite3,subprocess,tarfile
from pathlib import Path
from importlib.machinery import SourceFileLoader

def main():
    p=argparse.ArgumentParser();p.add_argument('--archive',type=Path,required=True);p.add_argument('--to',type=Path,required=True);a=p.parse_args()
    if os.geteuid()!=0:raise ValueError('Run on the VPS as root')
    if a.to.exists() or not a.archive.is_file():raise ValueError('A new target and an existing trusted archive are required')
    os.umask(0o077);a.to.mkdir(parents=True,mode=0o700)
    process=subprocess.Popen(['age','-d','-i','/etc/pocketbase/backup.agekey',str(a.archive)],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        with tarfile.open(fileobj=process.stdout,mode='r|gz') as tar:tar.extractall(a.to,filter='data')
    finally:process.stdout.close()
    if process.wait(timeout=30)!=0:raise ValueError('Backup decryption failed')
    data=a.to/'var/lib/pocketbase';db=data/'data.db';env=a.to/'etc/pocketbase/pocketbase.env'
    with sqlite3.connect('file:'+str(db)+'?mode=ro',uri=True) as c:
        if c.execute('pragma integrity_check').fetchone()[0]!='ok':raise ValueError('Restored database integrity failed')
    if env.stat().st_mode&0o077:raise ValueError('Restored environment permissions are unsafe')
    signature_ok=False;ledger=data/'.privacy-ledger.json'
    if ledger.exists():
        loader=SourceFileLoader('ledger','/usr/local/sbin/uchu-privacy-ledger');spec=importlib.util.spec_from_loader('ledger',loader);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        value=json.loads(ledger.read_text());signature_ok=hmac.compare_digest(value['hmac'],hmac.new(m.key(env),m.canonical(value['ledger']),hashlib.sha256).hexdigest())
        if not signature_ok:raise ValueError('Restored privacy ledger signature failed')
    (data/'.privacy-review-required').write_text('Apply the latest independently verified deletion ledger before production start.\n')
    print(json.dumps({'restore_integrity_ok':True,'privacy_ledger_signature_ok':signature_ok,'production_start_blocked_pending_latest_deletion_ledger':True}))
if __name__=='__main__':
    try:main()
    except Exception as e:print('Restore check failed: '+type(e).__name__);raise SystemExit(1)
