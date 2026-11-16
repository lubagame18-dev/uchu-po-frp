#!/usr/bin/env python3
"""Publish the reviewed quota fix, preserving every existing Function environment value."""
import argparse,base64,hashlib,importlib.util,json,os,time
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZIP_STORED
ROOT=Path('/root/uchu-privacy-upgrade')
def api(url,headers=None):
 with urlopen(__import__('urllib.request',fromlist=['Request']).Request(url,headers=headers or {}),timeout=40) as r:return json.load(r)
def main():
 p=argparse.ArgumentParser();p.add_argument('--ref',required=True);a=p.parse_args()
 if os.geteuid()!=0:raise ValueError('Run on the VPS as root')
 receipt=json.loads((ROOT/'receipt.json').read_text());manifest=json.loads((ROOT/'release.json').read_text())
 if not receipt.get('installed') or receipt['ref']!=a.ref:raise ValueError('Accept the matching PocketBase release first')
 if (ROOT/'function-receipt.json').exists():raise ValueError('Function change already accepted; inspect receipt')
 helper=Path('/root/uchu-cloud-version.py')
 if hashlib.sha256(helper.read_bytes()).hexdigest()!=manifest['cloud_helper_sha256']:raise ValueError('Cloud helper changed; review it before updating')
 spec=importlib.util.spec_from_file_location('cloud',helper);c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
 bearer=c.token();before=c.latest(bearer)
 if before.get('environment',{}).get('ACCOUNTS_BACKEND')!='pocketbase':raise ValueError('Account routing changed since acceptance')
 def save(name,value):
  path=ROOT/name;path.write_text(json.dumps(value));path.chmod(0o600)
 save('before-function.json',before)
 baseline=api('https://functions.yandexcloud.net/'+c.FUNCTION+'?path=/health')
 c.SOURCE_REF=a.ref;c.SOURCE_HASHES=manifest['proxy_files'];c.ZIP_DEFLATED=ZIP_STORED;c.ZIP_SHA256=manifest['function_stored_zip_sha256']
 archive=c.archive();body=c.base_body(before);body['content']=base64.b64encode(archive).decode();body['description']='Privacy release: trial replay protected; no device fingerprint'
 _,operation=c.request(c.API+'/functions/v1/versions',body,token=bearer);save('function-operation.json',operation)
 current=c.wait_operation(operation,bearer,'privacy-release');save('active-function.json',current)
 try:
  for attempt in range(6):
   now=api('https://functions.yandexcloud.net/'+c.FUNCTION+'?path=/health')
   if all(now.get(field)==baseline.get(field) for field in ['ok','pay','payBy','providers','deepseek','images','keys']):break
   time.sleep(2)
  for field in ['ok','pay','payBy','providers','deepseek','images','keys']:
   if now.get(field)!=baseline.get(field):raise ValueError('Provider readiness changed')
  check=api('https://functions.yandexcloud.net/'+c.FUNCTION+'?path=/admin/accounts-check',{'X-Admin-Token':before['environment']['ADMIN_TOKEN']})
  if not check.get('serviceAuthenticated') or check.get('provider')!='pocketbase':raise ValueError('Cloud to PocketBase probe failed')
  if current.get('environment')!=before.get('environment'):raise ValueError('Environment was not preserved')
 except Exception:c.rollback(before,bearer);raise
 result={'function_updated':True,'version':current['id'],'environment_unchanged':True,'providers_unchanged':True,'accounts_backend':'pocketbase','source_archive_verified':True};save('function-receipt.json',result);print(json.dumps(result))
if __name__=='__main__':
 try:main()
 except Exception as e:print('Privacy function update stopped: '+type(e).__name__+'. Inspect protected server receipts; no keys printed.');raise SystemExit(1)
