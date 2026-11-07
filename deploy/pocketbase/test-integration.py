"""Real PocketBase integration tests in an isolated temporary database, no external services."""
import concurrent.futures
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import socketserver
import threading
import email
import re
import html
from urllib.parse import urlsplit, parse_qs
import subprocess
import tempfile
import time
import unittest
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[2]
KIT = ROOT / 'deploy/pocketbase'
BINARY = Path(os.environ.get('POCKETBASE_BINARY', ROOT / 'work/pocketbase-docs/pocketbase')).resolve()

class MailSink(socketserver.StreamRequestHandler):
    messages=[]
    def handle(self):
        self.wfile.write(b'220 localhost test mail sink\r\n')
        while True:
            line=self.rfile.readline()
            if not line:return
            cmd=line.decode(errors='replace').strip().upper()
            if cmd.startswith('EHLO'):self.wfile.write(b'250-localhost\r\n250 SIZE 10000000\r\n')
            elif cmd.startswith('HELO'):self.wfile.write(b'250 localhost\r\n')
            elif cmd=='DATA':
                self.wfile.write(b'354 End data\r\n');message=[]
                while True:
                    row=self.rfile.readline()
                    if row in (b'.\r\n',b''):break
                    if row.startswith(b'..'):row=row[1:]  # SMTP dot unstuffing
                    message.append(row)
                self.messages.append(b''.join(message));self.wfile.write(b'250 accepted\r\n')
            elif cmd=='QUIT':self.wfile.write(b'221 goodbye\r\n');return
            else:self.wfile.write(b'250 ok\r\n')

class Accounts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix='uchu-pb-test-')
        cls.data = Path(cls.tmp.name) / 'pb_data'
        cls.service = secrets.token_hex(32)
        cls.password = secrets.token_urlsafe(24)
        cls.args = [str(BINARY), '--dir', str(cls.data), '--hooksDir', str(KIT/'pb_hooks'), '--migrationsDir', str(KIT/'pb_migrations')]
        subprocess.run([*cls.args,'migrate','up'], capture_output=True, check=True)
        subprocess.run([*cls.args,'superuser','create','fixture-admin@example.invalid',cls.password],capture_output=True,check=True)
        with socket.socket() as s:
            s.bind(('127.0.0.1',0)); cls.port = s.getsockname()[1]
        cls.base = 'http://127.0.0.1:' + str(cls.port)
        cls.log = open(Path(cls.tmp.name)/'server.log','w')
        cls.start()
        status, auth = cls.api('/api/collections/_superusers/auth-with-password', body={'identity':'fixture-admin@example.invalid','password':cls.password}, raw=True)
        assert status == 200, 'Fixture admin login failed'
        cls.admin = auth['token']
        cls.users = []
        for label in ('a','b'):
            status, user = cls.api('/api/collections/uchu_users/records',token=cls.admin, body={'email':'fixture-'+label+'@example.invalid','password':cls.password,'passwordConfirm':cls.password,'verified':True},raw=True)
            assert status == 200, 'Fixture user creation failed'
            status, auth = cls.api('/auth/v1/token?grant_type=password',body={'email':user['email'],'password':cls.password})
            assert status == 200, 'Compatibility login failed'
            cls.users.append((user['id'],auth['access_token']))

    @classmethod
    def start(cls):
        cls.proc = subprocess.Popen([*cls.args,'serve','--http=127.0.0.1:'+str(cls.port),'--hooksWatch=false'],env=dict(os.environ,UCHU_SERVICE_TOKEN=cls.service,UCHU_ALLOW_SIGNUP='true' if getattr(cls,'signup',False) else 'false'),stdout=cls.log,stderr=cls.log)
        for _ in range(100):
            try:
                if cls.api('/auth/v1/health')[0] == 200: return
            except (urllib.error.URLError,ConnectionError): pass
            time.sleep(.05)
        raise RuntimeError('Local PocketBase failed to start')

    @classmethod
    def api(cls,path,body=None,token=None,service=False,method=None,raw=False):
        if not raw: path = '/api/uchu'+path
        headers={'Content-Type':'application/json'}
        if token: headers['Authorization']='Bearer '+token
        if service: headers['apikey']=cls.service
        request=urllib.request.Request(cls.base+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method)
        try:
            with urllib.request.urlopen(request,timeout=10) as r:
                content=r.read();return r.status,json.loads(content) if content else None
        except urllib.error.HTTPError as r:
            content=r.read()
            try: j=json.loads(content)
            except ValueError: j=None
            return r.code,j

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate();cls.proc.wait(timeout=10);cls.log.close();cls.tmp.cleanup()

    def test_01_auth(self):
        uid,token=self.users[0]
        status,user=self.api('/auth/v1/user',token=token)
        self.assertEqual(status,200);self.assertEqual(user['id'],uid)
        self.assertEqual(self.api('/auth/v1/user')[0],401)
        self.assertEqual(self.api('/auth/v1/token?grant_type=password',body={'email':'fixture-a@example.invalid','password':'wrong'})[0],400)
        self.assertEqual(self.api('/auth/v1/signup',body={'email':'new@example.invalid','password':self.password})[0],503)
        self.assertEqual(self.api('/auth/v1/token?grant_type=refresh_token',body={'refresh_token':token})[0],200)
        self.assertEqual(self.api('/auth/v1/otp',body={})[0],503)

    def test_02_tenant_crud_and_upsert_collision(self):
        aid,at=self.users[0];bid,bt=self.users[1]
        body={'id':'local-lesson-1','user_id':aid,'data':{'text':'fixture'},'updated_at':'2026-01-01T00:00:00Z'}
        self.assertEqual(self.api('/rest/v1/lessons',body={'rows':[body]},token=at)[0],201)
        path='/rest/v1/lessons?id=eq.local-lesson-1'
        self.assertEqual(self.api(path,token=at)[1][0]['data']['text'],'fixture')
        self.assertEqual(self.api(path,token=bt)[1],[])
        self.assertEqual(self.api(path)[0],401)
        self.assertEqual(self.api('/rest/v1/lessons',body=body,token=bt)[0],403)
        self.assertEqual(self.api(path,body={'user_id':bid},token=at,method='PATCH')[0],403)
        self.assertEqual(self.api(path,body={'data':{'stolen':True}},token=bt,method='PATCH')[1],[])
        self.assertEqual(self.api(path,token=bt,method='DELETE')[1],[])
        self.assertEqual(self.api(path,body={'data':{'text':'edited'}},token=at,method='PATCH')[0],200)
        self.assertEqual(self.api('/rest/v1/lessons?select=id,data&order=updated_at.desc&limit=1',token=at)[1][0]['data']['text'],'edited')
        self.assertEqual(self.api(path,token=at,method='DELETE')[0],200)
        self.assertEqual(self.api(path,token=at)[1],[])

    def test_03_privileges_and_native_bypass(self):
        uid,token=self.users[0]
        self.assertEqual(self.api('/rest/v1/profiles',body={'id':uid,'plan':'aiYear'},token=token)[0],403)
        self.assertEqual(self.api('/rest/v1/ai_keys',token=token)[1],[])
        self.assertEqual(self.api('/rest/v1/rpc/apply_payment',body={},token=token)[0],403)
        self.assertEqual(self.api('/api/collections/uchu_lessons/records',token=token,raw=True)[0],403)
        self.assertEqual(self.api('/rest/v1/unknown',token=token)[0],404)
        self.assertEqual(self.api('/rest/v1/lessons',token=token,method='DELETE')[0],400)

    def test_04_payment_transaction_retries_and_concurrency(self):
        uid,token=self.users[0]
        self.assertEqual(self.api('/rest/v1/profiles',body={'id':uid,'plan':'ai','ai_left':0,'tokens_limit':0,'tokens_used':0},service=True)[0],201)
        self.assertEqual(self.api('/rest/v1/payments',body={'order_id':'fixture-order','user_id':uid,'kind':'pack_ai10','amount':70,'status':'created'},service=True)[0],201)
        path='/rest/v1/rpc/apply_payment'
        self.assertEqual(self.api(path,body={'order_id':'fixture-order','amount':1},service=True)[0],409)
        self.assertEqual(self.api(path,body={'order_id':'missing','amount':70},service=True)[0],409)
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results=list(pool.map(lambda _:self.api(path,body={'order_id':'fixture-order','amount':70},service=True),range(8)))
        self.assertTrue(all(status==200 for status,_ in results),results)
        self.assertEqual(sum(1 for _,r in results if r['applied']),1)
        status,rows=self.api('/rest/v1/profiles?id=eq.'+uid,token=token)
        self.assertEqual(status,200);self.assertEqual(rows[0]['ai_left'],10);self.assertEqual(rows[0]['tokens_limit'],400000)
        # Rollback when the transaction discovers an unknown stored product.
        self.api('/rest/v1/payments',body={'order_id':'bad-product','user_id':uid,'kind':'unknown','amount':70,'status':'created'},service=True)
        self.assertEqual(self.api(path,body={'order_id':'bad-product','amount':70},service=True)[0],409)
        self.assertEqual(self.api('/rest/v1/payments?order_id=eq.bad-product',service=True)[1][0]['status'],'created')

    def test_05_atomic_spend(self):
        uid,_=self.users[1]
        self.api('/rest/v1/profiles',body={'id':uid,'plan':'free','tokens_used':0,'tokens_limit':3},service=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            results=list(pool.map(lambda _:self.api('/rest/v1/rpc/spend_ai',body={'p_id':uid,'p_tokens':1,'p_tok':True},service=True),range(5)))
        self.assertTrue(all(status==200 for status,_ in results),results)
        self.assertEqual(sum(r is True for _,r in results),3)
        self.assertEqual(self.api('/rest/v1/profiles?id=eq.'+uid,service=True)[1][0]['tokens_used'],3)
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            results=list(pool.map(lambda _:self.api('/rest/v1/rpc/free_use_bump',body={'keys':['fixture-user'],'lims':[2],'mon':'2026-01','dry':False},service=True),range(5)))
        self.assertEqual(sum(not r['over'] for _,r in results),2)

    def test_06_quiz_privacy(self):
        uid,token=self.users[0];_,other=self.users[1]
        self.assertEqual(self.api('/rest/v1/quizzes',body={'id':'quizfixture01','user_id':uid,'template':'fixture'},token=token)[0],201)
        self.assertEqual(self.api('/rest/v1/quiz_questions',body={'quiz_id':'quizfixture01','data':{'questions':['fixture']}},token=token)[0],201)
        self.assertEqual(self.api('/rest/v1/rpc/quiz_public',body={'p_id':'quizfixture01'})[1]['questions'],['fixture'])
        self.assertEqual(self.api('/rest/v1/quiz_results',body={'quiz_id':'quizfixture01','student':'Fixture','klass':'','score':1,'total':1,'details':{}})[0],201)
        self.assertEqual(len(self.api('/rest/v1/quiz_results',token=token)[1]),1)
        self.assertEqual(self.api('/rest/v1/quiz_results',token=other)[1],[])
        self.assertEqual(self.api('/rest/v1/quiz_results')[0],401)
        self.assertEqual(self.api('/rest/v1/quizzes?id=eq.quizfixture01',token=token,method='DELETE')[0],200)
        self.assertEqual(self.api('/rest/v1/quiz_results',token=token)[1],[])

    def test_07_proxy_webhook(self):
        uid,_=self.users[0]
        self.api('/rest/v1/profiles',body={'id':uid,'plan':'ai','ai_left':0,'tokens_limit':0,'tokens_used':0},service=True)
        self.api('/rest/v1/payments',body={'order_id':'proxy-fixture','user_id':uid,'kind':'pack_ai10','amount':70,'status':'created'},service=True)
        scenario={'payment':{'status':'succeeded','paid':True,'amount':{'value':'70.00','currency':'RUB'},'metadata':{'uid':uid,'order':'proxy-fixture','kind':'pack_ai10'}},'expectedLessons':10,'expectedTokens':400000}
        result=subprocess.run(['node',str(KIT/'test-proxy.cjs')],input=json.dumps(scenario),text=True,capture_output=True,
          env=dict(os.environ,ACCOUNTS_BACKEND='pocketbase',POCKETBASE_URL=self.base,POCKETBASE_SERVICE_TOKEN=self.service,YOOKASSA_SHOP_ID='fixture',YOOKASSA_KEY='fixture'))
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)

    def test_08_restart_and_offline_restore(self):
        uid,token=self.users[0]
        self.api('/rest/v1/lessons',body={'id':'restart-fixture','user_id':uid,'data':{'text':'retained'}},token=token)
        self.proc.terminate();self.proc.wait(timeout=10)
        backup=Path(self.tmp.name)/'backups'
        subprocess.run(['bash',str(KIT/'backup.sh')],env=dict(os.environ,PB_DATA_DIR=str(self.data),PB_BACKUP_ROOT=str(backup),PB_IS_STOPPED='yes'),capture_output=True,check=True)
        snapshot=next(backup.iterdir())
        self.start()
        self.assertEqual(self.api('/rest/v1/lessons?id=eq.restart-fixture',token=token)[1][0]['data']['text'],'retained')
        self.api('/rest/v1/lessons?id=eq.restart-fixture',token=token,method='DELETE')
        self.proc.terminate();self.proc.wait(timeout=10)
        shutil.rmtree(self.data)
        subprocess.run(['bash',str(KIT/'restore.sh')],env=dict(os.environ,PB_RESTORE_FROM=str(snapshot),PB_RESTORE_TO=str(self.data),PB_IS_STOPPED='yes'),capture_output=True,check=True)
        self.start()
        self.assertEqual(self.api('/rest/v1/lessons?id=eq.restart-fixture',token=token)[1][0]['data']['text'],'retained')

    def test_09_email_verification_and_reset(self):
        sink=socketserver.ThreadingTCPServer(('127.0.0.1',0),MailSink)
        thread=threading.Thread(target=sink.serve_forever,daemon=True);thread.start()
        try:
            self.proc.terminate();self.proc.wait(timeout=10)
            type(self).signup=True;self.start()
            status,_=self.api('/api/settings',raw=True,token=self.admin,method='PATCH',body={
              'meta':{'appName':'Fixture','appURL':'https://site.example','senderName':'Fixture','senderAddress':'noreply@example.invalid'},
              'smtp':{'enabled':True,'host':'127.0.0.1','port':sink.server_address[1],'username':'','password':'','tls':False,'authMethod':'PLAIN'}})
            self.assertEqual(status,200)
            email_address='signup-fixture@example.invalid'
            self.assertEqual(self.api('/auth/v1/signup',body={'email':email_address,'password':self.password})[0],200)
            self.assertEqual(self.api('/auth/v1/token?grant_type=password',body={'email':email_address,'password':self.password})[0],403)
            def last_token(kind):
                message=email.message_from_bytes(MailSink.messages[-1])
                text=''.join(part.get_payload(decode=True).decode(errors='replace') for part in message.walk() if part.get_content_type()=='text/html')
                link=html.unescape(re.search(r'https://site.example/accounts-confirm.html[^"<> ]+',text).group())
                query=parse_qs(urlsplit(link).query)
                self.assertEqual(query['type'][0],kind)
                return query['token'][0]
            token=last_token('verification')
            self.assertEqual(len(token.split('.')),3,'Expected a resolved email token')
            self.assertEqual(self.api('/api/collections/uchu_users/confirm-verification',raw=True,body={'token':token})[0],204)
            self.assertEqual(self.api('/auth/v1/token?grant_type=password',body={'email':email_address,'password':self.password})[0],200)
            self.assertEqual(self.api('/auth/v1/recover',body={'email':email_address})[0],200)
            reset=last_token('recovery');new_password=secrets.token_urlsafe(24)
            self.assertEqual(self.api('/api/collections/uchu_users/confirm-password-reset',raw=True,body={'token':reset,'password':new_password,'passwordConfirm':new_password})[0],204)
            self.assertEqual(self.api('/auth/v1/token?grant_type=password',body={'email':email_address,'password':new_password})[0],200)
            self.assertEqual(self.api('/auth/v1/token?grant_type=password',body={'email':email_address,'password':self.password})[0],400)
            self.assertNotEqual(self.api('/api/collections/uchu_users/confirm-password-reset',raw=True,body={'token':reset,'password':self.password,'passwordConfirm':self.password})[0],204)
        finally:
            sink.shutdown();sink.server_close()

    @unittest.skipUnless(os.environ.get('POCKETBASE_BROWSER')=='1','Set POCKETBASE_BROWSER=1 to run full browser/export acceptance')
    def test_10_browser(self):
        fixture={'base':self.base,'email':'fixture-a@example.invalid','password':self.password,'uid':self.users[0][0],'otherEmail':'fixture-b@example.invalid','otherUid':self.users[1][0]}
        result=subprocess.run(['node',str(KIT/'test-browser.cjs')],input=json.dumps(fixture),text=True,capture_output=True,timeout=90)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        import zipfile
        with zipfile.ZipFile(ROOT/'work/pocketbase-browser/fixture.docx') as z:
            self.assertIn('STORAGE-MARKER-789',z.read('word/document.xml').decode())

    def test_11_auth_rate_limit(self):
        self.proc.terminate();self.proc.wait(timeout=10);self.start()
        statuses=[self.api('/auth/v1/token?grant_type=password',body={'email':'missing@example.invalid','password':'wrong'})[0] for _ in range(15)]
        self.assertIn(429,statuses,'Authentication rate limit was not enforced')

if __name__=='__main__': unittest.main(verbosity=2)
