"""Generate a NEW server-only secret file. Never prints its contents or overwrites keys."""
import argparse
import os
from pathlib import Path
import secrets
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--file',type=Path,required=True);p.add_argument('--data-dir',type=Path,required=True);args=p.parse_args()
root=Path(__file__).resolve().parents[2]
for target in (args.file.resolve(),args.data_dir.resolve()):
    if target==root or root in target.parents:raise SystemExit('Secrets and production data must be outside the static repository')
args.file.parent.mkdir(parents=True,exist_ok=True)
with os.fdopen(os.open(args.file,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as f:
    f.write('UCHU_SERVICE_TOKEN='+secrets.token_hex(32)+'\nPB_SETTINGS_KEY='+secrets.token_hex(16)+'\n')
    f.write('PB_DATA_DIR='+str(args.data_dir.resolve())+'\nPB_BIND=127.0.0.1:8090\nUCHU_ALLOW_SIGNUP=false\n')
    f.write('UCHU_ALLOW_SMS=false\nUCHU_ALLOW_SMS_SIGNUP=false\nUCHU_ALLOW_YANDEX=false\nUCHU_ALLOW_YANDEX_SIGNUP=false\nSMS_DAILY_MAX=30\nUCHU_SITE_ORIGIN=https://uchu-po-frp.ru\n')
print('New protected server environment created. Keep the settings key with encrypted backups. No site configuration changed.')
