"""Private acceptance gateway and real isolated PocketBase bootstrap. No external providers."""
from http.server import ThreadingHTTPServer
import email,html,http.client,importlib.util,json,os,re,secrets,shutil,socket,socketserver,subprocess,tempfile,threading,time,unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request,urlopen
from urllib.parse import urlsplit,parse_qs

KIT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('gate',KIT/'acceptance-server.py');gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)

class Gateway(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.folder=Path(self.tmp.name)
        self.config=self.folder/'config.json';self.config.write_text(json.dumps({'cap':'fixture-cap','session':'fixture-session','expires':time.time()+60}))
        self.patches=[patch.object(gate,'CONFIG',self.config),patch.object(gate,'ROOT',KIT),patch.object(gate,'AUDIT',self.folder/'audit')]
        for p in self.patches:p.start()
        self.server=ThreadingHTTPServer(('127.0.0.1',0),gate.Handler);self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join()
        for p in self.patches:p.stop()
        self.tmp.cleanup()
    def request(self,path,method='GET',body=None,**headers):
        h={'Host':'accounts.uchu-po-frp.ru','Origin':gate.ORIGIN,'Content-Type':'application/json',**headers}
        c=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=3);c.request(method,path,json.dumps(body) if body is not None else None,h);r=c.getresponse();result=r.status,dict(r.getheaders()),r.read();c.close();return result
    def test_html_contains_no_capability_and_real_provider_instructions(self):
        s,h,b=self.request('/check/');self.assertEqual(s,200);self.assertNotIn(b'fixture-cap',b);self.assertIn(b'https://accounts.uchu-po-frp.ru/google.html',b);self.assertEqual(h['Cache-Control'],'no-store');self.assertIn("frame-ancestors 'none'",h['Content-Security-Policy'])
    def test_open_requires_valid_capability_host_and_origin(self):
        for headers,body in [({}, {'token':'wrong'}),({'Origin':'null'},{'token':'fixture-cap'}),({'Host':'wrong.example'},{'token':'fixture-cap'})]:self.assertEqual(self.request('/check/open','POST',body,**headers)[0],403)
        s,h,_=self.request('/check/open','POST',{'token':'fixture-cap'});self.assertEqual(s,200)
        for v in ['HttpOnly','Secure','SameSite=Lax']:self.assertIn(v,h['Set-Cookie'])
    def test_api_status_requires_private_cookie_and_expiry(self):
        self.assertEqual(self.request('/check/status')[0],403);self.assertEqual(self.request('/check/status',Cookie='uchu_check=fixture-session')[0],200)
        d=json.loads(self.config.read_text());d['expires']=0;self.config.write_text(json.dumps(d));self.assertEqual(self.request('/check/status',Cookie='uchu_check=fixture-session')[0],403)
    def test_no_privileged_api_or_arbitrary_destination(self):
        for p in ['/api/check/auth/v1/admin/users','/api/check/../../../api/settings','/api/check/native/records','/api/check/http://evil.example','/api/check/rest/v1/payments']:
            self.assertEqual(self.request(p,Cookie='uchu_check=fixture-session')[0],404)
    def test_cross_origin_mutation_never_reaches_backend(self):
        self.assertEqual(self.request('/api/check/auth/v1/signup','POST',{},Cookie='uchu_check=fixture-session',Origin='https://other.example')[0],403)
    def test_oversized_body_refused(self):
        self.assertEqual(self.request('/check/open','POST',{'token':'x'*65537})[0],413)
    def test_fixed_loopback_forwarding_and_redacted_audit(self):
        class Response:
            code=200
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self,*args):return b'{"access_token":"fixture-provider-token"}'
        from unittest.mock import Mock
        client=Mock();client.open.return_value=Response()
        with patch.object(gate,'CLIENT',client):
            status,_,_=self.request('/api/check/auth/v1/google_finish','POST',{'code':'fixture-private-code'},Cookie='uchu_check=fixture-session',Authorization='Bearer fixture-owner-token')
        self.assertEqual(status,200)
        request=client.open.call_args.args[0]
        self.assertEqual(request.full_url,'http://127.0.0.1:8092/api/uchu/auth/v1/google_finish')
        self.assertEqual(request.get_header('Authorization'),'Bearer fixture-owner-token')
        text=(self.folder/'audit').read_text()
        self.assertIn('google_finish',text)
        for forbidden in ['fixture-owner-token','fixture-provider-token','fixture-private-code']:self.assertNotIn(forbidden,text)

class Bootstrap(unittest.TestCase):
    def test_real_isolated_database_has_verification_links_without_changing_source(self):
        binary=KIT.parents[1]/'work/pocketbase-docs/pocketbase'
        self.assertTrue(binary.is_file(),'Pinned local PocketBase is required')
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);hooks=root/'hooks';shutil.copytree(KIT/'pb_hooks',hooks)
            args=[str(binary),'--dir',str(root/'data'),'--hooksDir',str(hooks),'--migrationsDir',str(KIT/'pb_migrations')]
            env=dict(os.environ,UCHU_ACCEPTANCE='true',UCHU_ALLOW_SIGNUP='true',UCHU_SERVICE_TOKEN=secrets.token_hex(32));password="Fixture-"+secrets.token_urlsafe(24)
            for cmd in [['migrate','up'],['superuser','create','fixture@example.invalid',password]]:
                r=subprocess.run(args+cmd,env=env,capture_output=True);self.assertEqual(r.returncode,0,'Isolated fixture setup failed: '+r.stderr.decode()[-1000:]+r.stdout.decode()[-1000:])
            shutil.copy(KIT/'acceptance-bootstrap.pb.js',hooks/'zz-acceptance.pb.js')
            with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
            base='http://127.0.0.1:'+str(port)
            with (root/'log').open('w') as log:
                proc=subprocess.Popen(args+['serve','--http=127.0.0.1:'+str(port),'--hooksWatch=false'],env=env,stdout=log,stderr=log)
                try:
                    for n in range(60):
                        try:
                            with urlopen(base+'/api/uchu/auth/v1/health',timeout=1):break
                        except Exception:
                            if n==59:self.fail('Acceptance fixture bootstrap did not start: '+(root/'log').read_text()[-1500:])
                            time.sleep(.1)
                    def req(path,body=None,token=None,method=None):
                        h={'Content-Type':'application/json'}
                        if token:h['Authorization']=token
                        with urlopen(Request(base+path,data=json.dumps(body).encode() if body is not None else None,headers=h,method=method),timeout=4) as r:return {} if r.status==204 else json.load(r)
                    token=req('/api/collections/_superusers/auth-with-password',{'identity':'fixture@example.invalid','password':password})['token']
                    c=req('/api/collections/uchu_users',token=token);settings=req('/api/settings',token=token)
                    self.assertIn('{APP_URL}/check/verify?token={TOKEN}',c['verificationTemplate']['body'])
                    self.assertIn('{APP_URL}/check/reset?token={TOKEN}',c['resetPasswordTemplate']['body'])
                    self.assertEqual(settings['meta']['appURL'],gate.ORIGIN)
                    self.assertEqual(req('/api/collections/uchu_users/records',token=token)['totalItems'],0)
                    mail_spec=importlib.util.spec_from_file_location('integration_mail',KIT/'test-integration.py');mail_module=importlib.util.module_from_spec(mail_spec);mail_spec.loader.exec_module(mail_module)
                    mail_module.MailSink.messages=[]
                    sink=socketserver.ThreadingTCPServer(('127.0.0.1',0),mail_module.MailSink)
                    mail_thread=threading.Thread(target=sink.serve_forever,daemon=True);mail_thread.start()
                    try:
                        req('/api/settings',{'smtp':{'enabled':True,'host':'127.0.0.1','port':sink.server_address[1],'username':'','password':'','tls':False,'authMethod':'PLAIN'}},token=token,method='PATCH')
                        req('/api/uchu/auth/v1/signup',{'email':'mail-fixture@example.invalid','password':password})
                        def mail_link(kind):
                            message=email.message_from_bytes(mail_module.MailSink.messages[-1]);body=''.join(p.get_payload(decode=True).decode() for p in message.walk() if p.get_content_type()=='text/html')
                            links=[html.unescape(x) for x in re.findall(r'href="([^"]+)"',body)]
                            link=next(x for x in links if '/check/'+kind+'?' in x)
                            parsed=urlsplit(link);self.assertEqual(parsed.scheme,'https');self.assertEqual(parsed.hostname,'accounts.uchu-po-frp.ru')
                            value=parse_qs(parsed.query)['token'][0];self.assertEqual(len(value.split('.')),3)
                            self.assertNotIn('{TOKEN}',body);self.assertNotIn('{APP_URL}',body)
                            self.assertIn(html.escape(link,quote=False),body)
                            return value
                        verification=mail_link('verify')
                        req('/api/collections/uchu_users/confirm-verification',{'token':verification})
                        self.assertIn('access_token',req('/api/uchu/auth/v1/token?grant_type=password',{'email':'mail-fixture@example.invalid','password':password}))
                        req('/api/uchu/auth/v1/recover',{'email':'mail-fixture@example.invalid'})
                        reset=mail_link('reset');changed='Changed-'+secrets.token_urlsafe(16)
                        req('/api/collections/uchu_users/confirm-password-reset',{'token':reset,'password':changed,'passwordConfirm':changed})
                        self.assertIn('access_token',req('/api/uchu/auth/v1/token?grant_type=password',{'email':'mail-fixture@example.invalid','password':changed}))
                    finally:sink.shutdown();sink.server_close();mail_thread.join()
                finally:proc.terminate();proc.wait(timeout=10)

if __name__=='__main__':unittest.main(verbosity=2)
