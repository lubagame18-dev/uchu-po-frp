"""Real PocketBase and local SMTP only. Never contacts Postbox or real recipients."""
import concurrent.futures
import importlib.util
from pathlib import Path
import os
import socketserver
import threading
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('integration',Path(__file__).with_name('test-integration.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class Postbox(unittest.TestCase):
    def setUp(self):
        self.env=patch.dict(os.environ,{'UCHU_MAIL_MAX32D':'2','UCHU_POSTBOX_API_KEY_ID':'','UCHU_POSTBOX_API_KEY_SECRET':''})
        self.env.start();self.addCleanup(self.env.stop)
        m.Accounts.setUpClass();self.addCleanup(m.Accounts.tearDownClass)
        m.MailSink.messages=[]
        self.sink=socketserver.ThreadingTCPServer(('127.0.0.1',0),m.MailSink)
        threading.Thread(target=self.sink.serve_forever,daemon=True).start()
        self.addCleanup(self.sink.server_close);self.addCleanup(self.sink.shutdown)
        status,_=m.Accounts.api('/api/settings',raw=True,token=m.Accounts.admin,method='PATCH',body={
            'meta':{'appName':'Fixture','appURL':'https://site.example','senderName':'Fixture','senderAddress':'noreply@example.invalid'},
            'smtp':{'enabled':True,'host':'127.0.0.1','port':self.sink.server_address[1],'username':'','password':'','tls':False,'authMethod':'PLAIN'}})
        self.assertEqual(status,200)
    def send(self):return m.Accounts.api('/auth/v1/recover',body={'email':'fixture-a@example.invalid'})[0]
    def test_budget_blocks_third_message_and_survives_restart(self):
        self.assertEqual(self.send(),200);self.assertEqual(self.send(),200)
        self.assertNotEqual(self.send(),200);self.assertEqual(len(m.MailSink.messages),2)
        m.Accounts.proc.terminate();m.Accounts.proc.wait(timeout=10);m.Accounts.start()
        self.assertNotEqual(self.send(),200);self.assertEqual(len(m.MailSink.messages),2)
    def test_concurrent_messages_do_not_exceed_budget(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            results=list(pool.map(lambda _:self.send(),range(4)))
        self.assertEqual(results.count(200),2)
        self.assertEqual(len(m.MailSink.messages),2)
    def test_missing_ledger_fails_closed(self):
        status,_=m.Accounts.api('/api/collections/uchu_mail_budget',raw=True,token=m.Accounts.admin,method='DELETE')
        self.assertEqual(status,204)
        self.assertNotEqual(self.send(),200);self.assertEqual(len(m.MailSink.messages),0)

    def test_failed_smtp_attempts_are_not_refunded(self):
        status,_=m.Accounts.api('/api/settings',raw=True,token=m.Accounts.admin,method='PATCH',body={'smtp':{'port':9}})
        self.assertEqual(status,200)
        self.assertNotEqual(self.send(),200);self.assertNotEqual(self.send(),200)
        status,rows=m.Accounts.api('/api/collections/uchu_mail_budget/records',raw=True,token=m.Accounts.admin)
        self.assertEqual(status,200);self.assertEqual(sum(row['attempts'] for row in rows['items']),2)
        self.assertEqual(len(m.MailSink.messages),0)
        m.Accounts.api('/api/settings',raw=True,token=m.Accounts.admin,method='PATCH',body={'smtp':{'port':self.sink.server_address[1]}})
        self.assertNotEqual(self.send(),200);self.assertEqual(len(m.MailSink.messages),0)

class Bootstrap(unittest.TestCase):
    def test_native_postbox_settings_without_sending_mail(self):
        with patch.dict(os.environ,{'UCHU_POSTBOX_API_KEY_ID':'fixture-key-id-123456','UCHU_POSTBOX_API_KEY_SECRET':'fixture-key-secret-123456'}):
            m.Accounts.setUpClass()
            try:
                status,settings=m.Accounts.api('/api/settings',raw=True,token=m.Accounts.admin)
                self.assertEqual(status,200)
                self.assertTrue(settings['smtp']['enabled']);self.assertTrue(settings['smtp']['tls'])
                self.assertEqual(settings['smtp']['host'],'postbox.cloud.yandex.net')
                self.assertEqual(settings['smtp']['port'],465)
                self.assertEqual(settings['meta']['senderAddress'],'accounts@uchu-po-frp.ru')
                # No send call is made with these fixture credentials.
            finally:m.Accounts.tearDownClass()

if __name__=='__main__':unittest.main(verbosity=2)
