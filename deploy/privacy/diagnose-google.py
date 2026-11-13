#!/usr/bin/env python3
"""Check the saved Google web-client configuration without a real user's login or disclosing secrets."""
import json,os,secrets
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError
if os.geteuid()!=0:raise SystemExit('Run as root on the VPS')
env=dict(x.split('=',1) for x in Path('/etc/pocketbase/pocketbase.env').read_text().splitlines() if x and not x.startswith('#'))
body=urlencode({'client_id':env['GOOGLE_CLIENT_ID'],'client_secret':env['GOOGLE_CLIENT_SECRET'],'grant_type':'authorization_code','code':'uchu-nonexistent-'+secrets.token_urlsafe(32),'code_verifier':secrets.token_urlsafe(48),'redirect_uri':'https://uchu-po-frp.ru/google.html'}).encode()
try:
 with urlopen(Request('https://oauth2.googleapis.com/token',data=body,headers={'Content-Type':'application/x-www-form-urlencoded'}),timeout=25) as r:status=r.status;value=json.load(r)
except HTTPError as e:status=e.code;value=json.loads(e.read())
allowed={'invalid_client','invalid_grant','invalid_request','unauthorized_client','redirect_uri_mismatch'}
error=value.get('error');print(json.dumps({'http_status':status,'provider_error':error if error in allowed else 'other','invalid_client_detected':error=='invalid_client','real_user_login_tested':False}))
