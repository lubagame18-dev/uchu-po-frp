#!/usr/bin/env python3
"""Deploy an immutable reviewed Function archive without changing its environment."""
import argparse,base64,hashlib,importlib.util,json,os,re,time
from pathlib import Path
from urllib.request import Request,urlopen
from zipfile import ZIP_STORED

def get(url,headers=None,body=None):
 with urlopen(Request(url,headers=headers or {},data=None if body is None else json.dumps(body).encode()),timeout=35) as r:return json.load(r)
def main():
 p=argparse.ArgumentParser();p.add_argument('--ref',required=True);p.add_argument('--manifest',default='deploy/payment-fix/release.json');p.add_argument('--description',default='Verified payment confirmation, compact credits and atomic AI reservations');p.add_argument('--iam-json',type=Path,required=True);p.add_argument('--state-dir',type=Path,required=True);a=p.parse_args()
 if not re.fullmatch('[0-9a-f]{40}',a.ref):raise ValueError('Immutable commit required')
 if not re.fullmatch(r'deploy/[a-z0-9-]+/release\.json',a.manifest):raise ValueError('Reviewed release manifest path required')
 if a.iam_json.stat().st_mode&0o077:raise ValueError('IAM cache must be private')
 token=json.loads(a.iam_json.read_text())['token'];os.umask(0o077);a.state_dir.mkdir(mode=0o700,parents=True,exist_ok=True)
 if (a.state_dir/'receipt.json').exists() or (a.state_dir/'operation.json').exists():raise ValueError('Inspect the existing deployment state instead of redeploying')
 helper=Path(__file__).resolve().parents[1]/'pocketbase/cloud-version.py'
 with urlopen('https://raw.githubusercontent.com/lubagame18-dev/uchu-po-frp/'+a.ref+'/'+a.manifest,timeout=30) as r:m=json.load(r)
 if hashlib.sha256(helper.read_bytes()).hexdigest()!=m['cloud_helper_sha256']:raise ValueError('Cloud helper differs from reviewed manifest')
 spec=importlib.util.spec_from_file_location('cloud',helper);c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c);c.ROOT=a.state_dir
 health=get('https://accounts.uchu-po-frp.ru/api/uchu/auth/v1/health')
 if health.get('billing_revision')!=2:raise ValueError('Install the matching billing backend first')
 before=c.latest(token)
 if before.get('environment',{}).get('ACCOUNTS_BACKEND')!='pocketbase':raise ValueError('Backend changed')
 c.private_write('before-version.json',before);c.private_write('before-health.json',c.health());baseline=get('https://functions.yandexcloud.net/'+c.FUNCTION+'?path=/health')
 c.SOURCE_REF=a.ref;c.SOURCE_HASHES=m['proxy_files'];c.ZIP_SHA256=m['function_stored_zip_sha256'];c.ZIP_DEFLATED=ZIP_STORED;archive=c.archive()
 if c.latest(token)['id']!=before['id']:raise ValueError('Active version changed during preparation')
 body=c.base_body(before);body['content']=base64.b64encode(archive).decode();body['description']=a.description[:200]
 _,operation=c.request(c.API+'/functions/v1/versions',body,token=token);c.private_write('operation.json',operation);current=c.wait_operation(operation,token,'payment-fix');c.private_write('new-version.json',current)
 try:
  now=get('https://functions.yandexcloud.net/'+c.FUNCTION+'?path=/health')
  for field in ['ok','pay','payBy','providers','deepseek','images','keys']:
   if now.get(field)!=baseline.get(field):raise ValueError('Provider readiness changed')
  if current.get('environment')!=before.get('environment'):raise ValueError('Environment changed')
  probe=get('https://functions.yandexcloud.net/'+c.FUNCTION+'?path=/admin/accounts-check',{'X-Admin-Token':before['environment']['ADMIN_TOKEN']})
  if not probe.get('serviceAuthenticated'):raise ValueError('Account backend authentication failed')
 except Exception:c.rollback(before,token);raise
 result={'deployed':True,'version':current['id'],'previous_version':before['id'],'source_ref':a.ref,'environment_unchanged':True,'providers_unchanged':True};c.private_write('receipt.json',result);print(json.dumps(result))
if __name__=='__main__':
 try:main()
 except Exception as e:print('Function deployment stopped: '+type(e).__name__+'. Inspect protected deployment state.');raise SystemExit(1)
