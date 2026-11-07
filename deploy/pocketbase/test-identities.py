"""Real PocketBase identity state machines; external SMS/Yandex providers replaced only in temporary test hooks."""
import base64
import concurrent.futures
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import unittest
from urllib.parse import urlencode, parse_qs, urlsplit

KIT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('integration',KIT/'test-integration.py');integration=importlib.util.module_from_spec(spec);spec.loader.exec_module(integration)

class Provider(BaseHTTPRequestHandler):
    messages=[]
    def log_message(self,*args):pass
    def do_GET(self):
        self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(self.messages[-1] if self.messages else {}).encode())
    def do_POST(self):
        body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if self.path=='/sms':
            self.messages.append(body);result={'ok':True}
        elif self.path in ('/yandex','/google'):
            if body['code']=='failed':self.send_response(502);self.end_headers();return
            kind=self.path[1:]
            result={'id':'browser-'+kind,'email':'browser-'+kind+'@example.invalid'} if body['code']=='browser' else json.loads(body['code'])
        else:self.send_response(404);self.end_headers();return
        self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(result).encode())

class Identities(unittest.TestCase):
    api=classmethod(integration.Accounts.api.__func__)
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(prefix='uchu-identities-');cls.data=Path(cls.tmp.name)/'data';cls.service=secrets.token_hex(32);cls.password=secrets.token_urlsafe(24)
        cls.hooks=Path(cls.tmp.name)/'hooks';shutil.copytree(KIT/'pb_hooks',cls.hooks)
        cls.provider=ThreadingHTTPServer(('127.0.0.1',0),Provider);cls.thread=threading.Thread(target=cls.provider.serve_forever,daemon=True);cls.thread.start()
        fixture='http://127.0.0.1:'+str(cls.provider.server_port)
        # Production adapter never has configurable endpoints or a test-mode bypass.
        (cls.hooks/'identity-providers.js').write_text("""
exports.smsConfigured=()=>true;
exports.yandexConfigured=()=>true;
exports.googleConfigured=()=>true;
exports.sendSms=(phone,code)=>{const r=$http.send({url:FIXTURE+'/sms',method:'POST',body:JSON.stringify({phone,code})});if(r.statusCode!==200)throw Error('fixture provider');};
exports.yandexAuthorize=(state,challenge,callback)=>'https://oauth.yandex.ru/authorize?state='+state+'&code_challenge='+challenge+'&code_challenge_method=S256&redirect_uri='+encodeURIComponent(callback);
exports.yandexIdentity=(code,verifier,callback)=>{const r=$http.send({url:FIXTURE+'/yandex',method:'POST',body:JSON.stringify({code,verifier,callback})});if(r.statusCode!==200)throw Error('fixture provider');return r.json;};
exports.googleAuthorize=(state,challenge,callback)=>'https://accounts.google.com/o/oauth2/v2/auth?state='+state+'&code_challenge='+challenge+'&code_challenge_method=S256&redirect_uri='+encodeURIComponent(callback);
exports.googleIdentity=(code,verifier,callback)=>{const r=$http.send({url:FIXTURE+'/google',method:'POST',body:JSON.stringify({code,verifier,callback})});if(r.statusCode!==200)throw Error('fixture provider');return r.json;};
""".replace('FIXTURE',json.dumps(fixture)))
        cls.args=[str(integration.BINARY),'--dir',str(cls.data),'--hooksDir',str(cls.hooks),'--migrationsDir',str(KIT/'pb_migrations')]
        subprocess.run([*cls.args,'migrate','up'],capture_output=True,check=True)
        subprocess.run([*cls.args,'superuser','create','fixture-admin@example.invalid',cls.password],capture_output=True,check=True)
        with socket.socket() as s:s.bind(('127.0.0.1',0));cls.port=s.getsockname()[1]
        cls.base='http://127.0.0.1:'+str(cls.port);cls.log=open(Path(cls.tmp.name)/'server.log','w');cls.start()
        status,auth=cls.api('/api/collections/_superusers/auth-with-password',body={'identity':'fixture-admin@example.invalid','password':cls.password},raw=True)
        assert status==200;cls.admin=auth['token']
        cls.api('/api/settings',method='PATCH',body={'rateLimits':{'enabled':False}},token=cls.admin,raw=True)
    @classmethod
    def start(cls):
        cls.proc=subprocess.Popen([*cls.args,'serve','--http=127.0.0.1:'+str(cls.port),'--hooksWatch=false'],stdout=cls.log,stderr=cls.log,env=dict(os.environ,UCHU_SERVICE_TOKEN=cls.service,UCHU_ALLOW_SMS='true',UCHU_ALLOW_SMS_SIGNUP='true',UCHU_ALLOW_YANDEX='true',UCHU_ALLOW_YANDEX_SIGNUP='true',UCHU_ALLOW_GOOGLE='true',UCHU_ALLOW_GOOGLE_SIGNUP='true'))
        for _ in range(100):
            try:
                if cls.api('/auth/v1/health')[0]==200:return
            except Exception:pass
            time.sleep(.05)
        raise RuntimeError('Fixture PocketBase failed to start')
    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate();cls.proc.wait(timeout=10);cls.log.close();cls.provider.shutdown();cls.provider.server_close();cls.tmp.cleanup()
    def setUp(self):
        # Reset IP fixture counters between independent tests, not within a scenario.
        for r in self.states():
            if r['key'].startswith(('sms-ip:','yandex-ip:','google-ip:')):self.native('/'+r['id'],method='DELETE')
    def native(self,suffix='',**kw):return self.api('/api/collections/uchu_login_state/records'+suffix,token=self.admin,raw=True,**kw)
    def states(self):return self.native('?perPage=500')[1]['items']
    def patch_state(self,r,**changes):return self.native('/'+r['id'],method='PATCH',body=changes)
    def sms(self,p,token=None,link=False):
        status,j=self.api('/auth/v1/otp',body={'phone':p,'link':link},token=token);self.assertEqual(status,200,j)
        self.assertNotIn('code',j);return next(x['code'] for x in reversed(Provider.messages) if x['phone']==p)
    def verify(self,p,code,token=None):return self.api('/auth/v1/verify',body={'type':'sms','phone':p,'token':code},token=token)
    def email_user(self,label):
        status,u=self.api('/auth/v1/admin/users',body={'email':label+'@example.invalid','password':self.password,'email_confirm':True},service=True);self.assertEqual(status,201,u)
        status,s=self.api('/auth/v1/token?grant_type=password',body={'email':u['email'],'password':self.password});self.assertEqual(status,200,s);return s
    def oauth(self,token=None,link=False,kind="yandex"):
        verifier=secrets.token_urlsafe(32);state=secrets.token_urlsafe(32);challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
        body={'state':state,'code_challenge':challenge,'link':link};status,j=self.api('/auth/v1/'+kind+'_start',body=body,token=token);self.assertEqual(status,200,j)
        q=parse_qs(urlsplit(j['url']).query);self.assertEqual(q['state'],[state]);self.assertEqual(q['code_challenge'],[challenge]);self.assertEqual(q['redirect_uri'],['https://uchu-po-frp.ru/'+kind+'.html'])
        return {'state':state,'code_verifier':verifier}
    def finish(self,b,identity,token=None,kind='yandex'):return self.api('/auth/v1/'+kind+'_finish',body=dict(b,code=json.dumps(identity) if isinstance(identity,dict) else identity),token=token)
    def test_01_sms_single_use_and_ownership(self):
        p='+79000000001';code=self.sms(p);self.assertEqual(self.api('/auth/v1/otp',body={'phone':p})[0],429)
        status,s=self.verify(p,code);self.assertEqual(status,200,s);uid=s['user']['id'];self.assertEqual(s['user']['phone'],p);self.assertFalse(s['user']['email'])
        self.assertEqual(self.verify(p,code)[0],400)
        self.assertEqual(self.api('/rest/v1/lessons',body={'id':'sms-lesson','data':{'text':'private'}},token=s['access_token'])[0],201)
        other=self.email_user('sms-other');self.assertEqual(self.api('/rest/v1/lessons?id=eq.sms-lesson',token=other['access_token'])[1],[])
        profiles=self.api('/rest/v1/profiles?id=eq.'+uid,token=s['access_token'])[1];self.assertEqual(len(profiles),1);self.assertEqual(profiles[0]['ai_left'],2)
        self.assertEqual(self.api('/api/collections/uchu_login_state/records',token=s['access_token'],raw=True)[0],403)
    def test_02_sms_attempts_expiry_and_resend(self):
        p='+79000000002';code=self.sms(p);bad='000000' if code!='000000' else '111111'
        for _ in range(5):self.assertEqual(self.verify(p,bad)[0],400)
        self.assertEqual(self.verify(p,code)[0],400)
        r=next(r for r in self.states() if r['data'].get('otp') and r['data']['attempts']==5);d=r['data'];d['sentAt']-=61000;self.patch_state(r,data=d)
        new=self.sms(p)
        if new!=code:self.assertEqual(self.verify(p,code)[0],400)
        self.assertEqual(self.verify(p,new)[0],200)
        p='+79000000003';code=self.sms(p);r=next(r for r in self.states() if r['data'].get('otp') and not r['data']['used'] and r['data']['attempts']==0);self.patch_state(r,expires=int(time.time()*1000)-1)
        self.assertEqual(self.verify(p,code)[0],400)
    def test_03_sms_link_and_collision(self):
        a=self.email_user('link-phone-a');b=self.email_user('link-phone-b');p='+79000000004';code=self.sms(p,a['access_token'],True)
        self.assertEqual(self.verify(p,code)[0],401)
        status,s=self.verify(p,code,a['access_token']);self.assertEqual(status,200,s);self.assertEqual(s['user']['id'],a['user']['id'])
        r=next(r for r in self.states() if r['data'].get('owner')==a['user']['id']);d=r['data'];d['sentAt']-=61000;self.patch_state(r,data=d)
        code=self.sms(p,b['access_token'],True);self.assertEqual(self.verify(p,code,b['access_token'])[0],409)
        self.assertEqual(self.api('/auth/v1/otp',body={'phone':'+79000000009','link':True})[0],401)
    def test_04_sms_concurrent_verify_and_restart_limits(self):
        p='+79000000005';code=self.sms(p)
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:results=list(pool.map(lambda _:self.verify(p,code),range(5)))
        self.assertEqual(sum(s==200 for s,_ in results),1,results)
        self.proc.terminate();self.proc.wait(timeout=10);self.start()
        self.assertEqual(self.api('/auth/v1/otp',body={'phone':p})[0],429)
        self.assertEqual(self.api('/auth/v1/otp',body={'phone':'+12025550000'})[0],400)
        self.assertEqual(self.api('/auth/v1/otp',body={'phone':'+79400000000'})[0],400)
    def test_05_yandex_pkce_replay_and_stable_subject(self):
        b=self.oauth();identity={'id':'subject-1','email':'yandex-one@example.invalid'}
        wrong=dict(b,code_verifier=secrets.token_urlsafe(32));self.assertEqual(self.finish(wrong,identity)[0],400)
        status,s=self.finish(b,identity);self.assertEqual(status,200,s);uid=s['user']['id']
        self.assertEqual(self.finish(b,identity)[0],400)
        status,again=self.finish(self.oauth(),{'id':'subject-1','email':'new-address@example.invalid'});self.assertEqual(status,200,again);self.assertEqual(again['user']['id'],uid)
    def test_06_yandex_email_collision_requires_link(self):
        owner=self.email_user('yandex-collision');other=self.email_user('yandex-other');identity={'id':'subject-2','email':owner['user']['email']}
        self.assertEqual(self.finish(self.oauth(),identity)[0],409)
        status,s=self.finish(self.oauth(owner['access_token'],True),identity,owner['access_token']);self.assertEqual(status,200,s);self.assertEqual(s['user']['id'],owner['user']['id'])
        self.assertEqual(self.finish(self.oauth(other['access_token'],True),identity,other['access_token'])[0],409)
        self.assertEqual(self.api('/auth/v1/yandex_start',body={'link':True})[0],401)
    def test_07_yandex_expiry_and_provider_failure(self):
        b=self.oauth();r=next(r for r in self.states() if r['key'].startswith('yandex:') and not r['data']['used']);self.patch_state(r,expires=int(time.time()*1000)-1)
        self.assertEqual(self.finish(b,{'id':'expired','email':'e@example.invalid'})[0],400)
        b=self.oauth();self.assertEqual(self.finish(b,'failed')[0],502);self.assertEqual(self.finish(b,'failed')[0],400)
    def test_08_browser(self):
        if os.environ.get('POCKETBASE_BROWSER')!='1':self.skipTest('Set POCKETBASE_BROWSER=1 for real browser identity flows')
        result=subprocess.run(['node',str(KIT/'test-identities-browser.cjs')],input=json.dumps({'base':self.base,'sink':'http://127.0.0.1:'+str(self.provider.server_port)}),text=True,capture_output=True,timeout=90)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
    def test_08b_google_pkce_link_and_cross_provider(self):
        b=self.oauth(kind='google');identity={'id':'google-subject','email':'google@example.invalid'}
        self.assertEqual(self.finish(b,identity)[0],400) # Google state cannot enter Yandex route.
        self.assertEqual(self.finish(dict(b,code_verifier='x'*43),identity,kind='google')[0],400)
        status,session=self.finish(b,identity,kind='google');self.assertEqual(status,200,session)
        self.assertEqual(self.finish(b,identity,kind='google')[0],400)
        same=self.finish(self.oauth(kind='google'),dict(identity,email='changed@example.invalid'),kind='google')[1]
        self.assertEqual(same['user']['id'],session['user']['id'])
        owner=self.email_user('google-collision');identity={'id':'google-link','email':owner['user']['email']}
        self.assertEqual(self.finish(self.oauth(kind='google'),identity,kind='google')[0],409)
        linked=self.finish(self.oauth(owner['access_token'],True,kind='google'),identity,owner['access_token'],kind='google')
        self.assertEqual(linked[0],200,linked);self.assertEqual(linked[1]['user']['id'],owner['user']['id'])
    def test_09_sms_budget_persists_and_blocks_delivery(self):
        r=next(r for r in self.states() if r['key'].startswith('sms-day:'));original=r['data'];self.patch_state(r,data={'n':30})
        try:
            self.proc.terminate();self.proc.wait(timeout=10);self.start();before=len(Provider.messages)
            self.assertEqual(self.api('/auth/v1/otp',body={'phone':'+79000000009'})[0],429)
            self.assertEqual(len(Provider.messages),before)
        finally:self.patch_state(r,data=original)
    def test_10_imported_phone_keeps_legacy_identity(self):
        p='+79000000010'
        body={'phone':p,'phone_confirm':True,'legacy_id':'source-phone-user','password':self.password}
        status,user=self.api('/auth/v1/admin/users',body=body,service=True);self.assertEqual(status,201,user)
        code=self.sms(p);status,s=self.verify(p,code);self.assertEqual(status,200,s)
        self.assertEqual(s['user']['id'],user['id']);self.assertEqual(s['user']['legacy_id'],'source-phone-user')
        self.assertEqual(self.api('/auth/v1/admin/users',body=body,service=True)[0],409)
        self.assertEqual(self.api('/auth/v1/admin/users',body=dict(body,phone='+79000000011',email='not-confirmed@example.invalid'),service=True)[0],400)
    def test_11_monthly_budget_survives_restart(self):
        r=next(r for r in self.states() if r['key'].startswith('sms-month:'));original=r['data'];self.patch_state(r,data={'n':19})
        try:
            before=len(Provider.messages)
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                results=list(pool.map(lambda p:self.api('/auth/v1/otp',body={'phone':p}),['+79000000012','+79000000013']))
            self.assertEqual(sorted(s for s,_ in results),[200,429]);self.assertEqual(len(Provider.messages),before+1)
            self.proc.terminate();self.proc.wait(timeout=10);self.start();before=len(Provider.messages)
            self.assertEqual(self.api('/auth/v1/otp',body={'phone':'+79000000014'})[0],429)
            self.assertEqual(len(Provider.messages),before)
        finally:self.patch_state(r,data=original)

if __name__=='__main__':unittest.main(verbosity=2)
