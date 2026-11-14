"""Privacy contract, deletion and trial replay checks against real isolated PocketBase and SMTP."""
import importlib.util,json,secrets,socketserver,threading,re,email,html,time,unittest,os,subprocess
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
spec=importlib.util.spec_from_file_location('integration',Path(__file__).with_name('test-integration.py'));integration=importlib.util.module_from_spec(spec);spec.loader.exec_module(integration)
LEGAL={'offer':True,'offer_version':'2026-11-13','policy_version':'2026-11-13','consent_version':'2026-11-13','profile_consent':False}
class Privacy(unittest.TestCase):
    api=classmethod(integration.Accounts.api.__func__)
    start=classmethod(integration.Accounts.start.__func__)
    @classmethod
    def setUpClass(cls):
        integration.Accounts.setUpClass.__func__(cls)
        cls.proc.terminate();cls.proc.wait(timeout=10);cls.signup=True;cls.start()
        cls.sink=socketserver.ThreadingTCPServer(('127.0.0.1',0),integration.MailSink);threading.Thread(target=cls.sink.serve_forever,daemon=True).start()
        cls.api('/api/settings',raw=True,token=cls.admin,method='PATCH',body={'meta':{'appName':'Fixture','appURL':'https://site.example','senderName':'Fixture','senderAddress':'noreply@example.invalid'},'rateLimits':{'enabled':False},'smtp':{'enabled':True,'host':'127.0.0.1','port':cls.sink.server_address[1],'tls':False,'username':'','password':'','authMethod':'PLAIN'}})
    @classmethod
    def tearDownClass(cls):
        cls.sink.shutdown();cls.sink.server_close();integration.Accounts.tearDownClass.__func__(cls)
    def create_user(self,address):
        status,j=self.api('/auth/v1/signup',body={'email':address,'password':self.password,'legal':LEGAL});self.assertEqual(status,200,j)
        msg=email.message_from_bytes(integration.MailSink.messages[-1]);text='\n'.join(p.get_payload(decode=True).decode(errors='replace') for p in msg.walk() if p.get_content_type()=='text/html')
        token=parse_qs(urlsplit(html.unescape(re.search(r'https://site.example/accounts-confirm.html[^"<> ]+',text).group())).query)['token'][0]
        self.assertEqual(self.api('/api/collections/uchu_users/confirm-verification',raw=True,body={'token':token})[0],204)
        status,session=self.api('/auth/v1/token?grant_type=password',body={'email':address,'password':self.password});self.assertEqual(status,200,session);return session
    def test_01_acceptance_and_optional_profile(self):
        self.assertEqual(self.api('/auth/v1/signup',body={'email':'missing-legal@example.invalid','password':self.password})[0],400)
        session=self.create_user('privacy-profile@example.invalid');token=session['access_token'];uid=session['user']['id']
        row={'id':uid,'name':'Private fixture name'}
        self.assertEqual(self.api('/rest/v1/user_info',body=row,token=token)[0],403)
        self.assertEqual(self.api('/privacy/v1/profile-consent',body={'accepted':True,'version':'old'},token=token)[0],400)
        self.assertEqual(self.api('/privacy/v1/profile-consent',body={'accepted':True,'version':'2026-11-13'},token=token)[0],200)
        self.assertEqual(self.api('/rest/v1/user_info',body=row,token=token)[0],201)
        status,export=self.api('/privacy/v1/export',token=token);self.assertEqual(status,200);self.assertEqual(export['account']['id'],uid)
        self.assertEqual(export['tables']['user_info'][0]['name'],row['name']);self.assertNotIn('password',json.dumps(export));self.assertNotIn('access_token',json.dumps(export))
        self.assertEqual(self.api('/privacy/v1/export')[0],401)
        self.assertEqual(self.api('/privacy/v1/profile-consent',body={'accepted':False,'version':'2026-11-13'},token=token)[0],200)
        self.assertEqual(self.api('/rest/v1/user_info',token=token)[1],[])
        self.assertFalse(self.api('/privacy/v1/status',token=token)[1]['profile_consent'])
    def test_02_delete_code_ownership_export_and_trial_replay(self):
        session=self.create_user('Trial.Fixture+first@gmail.com');uid=session['user']['id'];token=session['access_token'];other=self.users[0][1]
        self.assertEqual(self.api('/rest/v1/profiles',token=token)[1][0]['ai_left'],2)
        self.api('/rest/v1/lessons',body={'id':'privacy-delete-own','data':{'lesson':'DELETE-ME'}},token=token)
        self.api('/rest/v1/lessons',body={'id':'privacy-delete-other','data':{'lesson':'KEEP-ME'}},token=other)
        self.assertEqual(self.api('/privacy/v1/delete-start',token=token,body={})[0],200)
        raw=email.message_from_bytes(integration.MailSink.messages[-1]);text='\n'.join(p.get_payload(decode=True).decode(errors='replace') for p in raw.walk() if p.get_content_type()=='text/html');code=re.search(r'<strong>(\d{8})</strong>',text).group(1)
        self.assertEqual(self.api('/privacy/v1/delete-confirm',body={'code':code},token=other)[0],400)
        wrong='00000000' if code!='00000000' else '11111111';self.assertEqual(self.api('/privacy/v1/delete-confirm',body={'code':wrong},token=token)[0],400)
        status,result=self.api('/privacy/v1/delete-confirm',body={'code':code},token=token);self.assertEqual(status,200,result);self.assertTrue(result['deleted'])
        self.assertEqual(self.api('/auth/v1/user',token=token)[0],401)
        self.assertEqual(self.api('/rest/v1/lessons?id=eq.privacy-delete-own',service=True)[1],[])
        self.assertEqual(len(self.api('/rest/v1/lessons?id=eq.privacy-delete-other',token=other)[1]),1)
        recreated=self.create_user('trialfixture+second@googlemail.com');newtoken=recreated['access_token']
        profile=self.api('/rest/v1/profiles',token=newtoken)[1][0];self.assertEqual(profile['ai_left'],0);self.assertEqual(profile['tokens_limit'],0);self.assertTrue(profile['trial_blocked']);self.assertEqual(self.api('/rest/v1/rpc/free_use_bump',body={'keys':['u:'+recreated['user']['id']],'lims':[2],'mon':'2026-11','dry':False},service=True)[1]['left'],0)
        self.assertEqual(self.api('/rest/v1/lessons',token=newtoken)[1],[])
        result=subprocess.run(['node',str(Path(__file__).with_name('test-trial-quota.cjs'))],input=json.dumps({'base':self.base,'service':self.service,'token':newtoken,'allowed':False}),text=True,capture_output=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertEqual(self.api('/rest/v1/profiles',token=newtoken)[1][0]['tokens_limit'],0)
        self.api('/rest/v1/payments',service=True,body={'order_id':'recreated-paid-pack','user_id':recreated['user']['id'],'kind':'pack_ai10','amount':70,'status':'created'})
        self.assertEqual(self.api('/rest/v1/rpc/apply_payment',service=True,body={'order_id':'recreated-paid-pack','amount':70})[0],200)
        result=subprocess.run(['node',str(Path(__file__).with_name('test-trial-quota.cjs'))],input=json.dumps({'base':self.base,'service':self.service,'token':newtoken,'allowed':True}),text=True,capture_output=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)

        status,claims=self.api('/api/collections/uchu_trial_claims/records?perPage=100',raw=True,token=self.admin);self.assertEqual(status,200);self.assertNotIn('gmail.com',json.dumps(claims));self.assertNotIn('Trial.Fixture',json.dumps(claims))
    def test_02b_pending_payment_blocks_deletion_until_reconciled(self):
        session=self.create_user('privacy-pending@example.invalid');uid=session['user']['id'];token=session['access_token']
        self.api('/rest/v1/payments',service=True,body={'order_id':'privacy-pending-order','user_id':uid,'kind':'pack_ai10','amount':70,'status':'created'})
        self.assertEqual(self.api('/privacy/v1/delete-start',token=token,body={})[0],200)
        msg=email.message_from_bytes(integration.MailSink.messages[-1]);text=''.join(p.get_payload(decode=True).decode(errors='replace') for p in msg.walk() if p.get_content_type()=='text/html');code=re.search(r'<strong>([0-9]{8})</strong>',text).group(1)
        self.assertEqual(self.api('/privacy/v1/delete-confirm',body={'code':code},token=token)[0],409)
        self.assertEqual(self.api('/auth/v1/user',token=token)[0],200)
        self.api('/rest/v1/payments?order_id=eq.privacy-pending-order',service=True,method='PATCH',body={'status':'canceled'})
        self.assertEqual(self.api('/privacy/v1/delete-confirm',body={'code':code},token=token)[0],200)
        self.assertEqual(self.api('/rest/v1/payments?order_id=eq.privacy-pending-order',service=True)[1][0]['status'],'canceled')
    def test_03_methods_and_native_privacy_data_closed(self):
        token=self.users[0][1]
        self.assertEqual(self.api('/privacy/v1/delete-start',token=token)[0],405)
        for name in ['privacy_events','trial_claims','deletions']:
            self.assertEqual(self.api('/api/collections/uchu_'+name+'/records',raw=True,token=token)[0],403)
    @unittest.skipUnless(os.environ.get('POCKETBASE_BROWSER')=='1','Set POCKETBASE_BROWSER=1 for browser settings/deletion')
    def test_04_browser_settings_export_and_delete(self):
        address='privacy-browser@example.invalid';session=self.create_user(address);code_file=Path(self.tmp.name)/'browser-code.json';stopped=threading.Event()
        def watch():
            seen=len(integration.MailSink.messages)
            while not stopped.wait(.03):
                for raw in integration.MailSink.messages[seen:]:
                    msg=email.message_from_bytes(raw);text=''.join(p.get_payload(decode=True).decode(errors='replace') for p in msg.walk() if p.get_content_type()=='text/html');match=re.search(r'<strong>([0-9]{8})</strong>',text)
                    if match:code_file.write_text(json.dumps({'code':match.group(1)}))
                seen=len(integration.MailSink.messages)
        thread=threading.Thread(target=watch,daemon=True);thread.start()
        try:
            fixture={'base':self.base,'email':address,'password':self.password,'uid':session['user']['id'],'codeFile':str(code_file)}
            result=subprocess.run(['node',str(Path(__file__).with_name('test-privacy-browser.cjs'))],input=json.dumps(fixture),capture_output=True,text=True,timeout=100)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        finally:stopped.set();thread.join(timeout=2)
        self.assertEqual(self.api('/auth/v1/user',token=session['access_token'])[0],401)

if __name__=='__main__':unittest.main(verbosity=2)
