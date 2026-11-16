"""Run the pinned PocketBase with protected environment file; no hosting provider is selected."""
import argparse
import os
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--env-file',type=Path,required=True);p.add_argument('--binary',type=Path,required=True);args=p.parse_args()
if args.env_file.stat().st_mode & 0o077: raise SystemExit('Environment file must have permissions 600')
values={}
for line in args.env_file.read_text().splitlines():
    if line and not line.startswith('#'):
        key,value=line.split('=',1);values[key]=value
if len(values.get('UCHU_SERVICE_TOKEN',''))<32 or len(values.get('PB_SETTINGS_KEY',''))!=32: raise SystemExit('Server secret/encryption key are missing or invalid')
data=Path(values['PB_DATA_DIR']).resolve()
if data==ROOT or ROOT in data.parents: raise SystemExit('Production data must be outside the static source repository')
version=subprocess.check_output([str(args.binary.resolve()),'--version'],text=True).strip()
if version!='pocketbase version 0.40.6':raise SystemExit('Unexpected binary version; use the pinned release')
data.mkdir(parents=True,exist_ok=True);data.chmod(0o700)
env=dict(os.environ,**values)
os.execve(str(args.binary.resolve()),[str(args.binary.resolve()),'serve','--dir',str(data),'--http',values.get('PB_BIND','127.0.0.1:8090'),
 '--hooksDir',str(ROOT/'deploy/pocketbase/pb_hooks'),'--migrationsDir',str(ROOT/'deploy/pocketbase/pb_migrations'),
 '--hooksWatch=false','--encryptionEnv','PB_SETTINGS_KEY'],env)
