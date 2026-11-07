"""Offline checks: installer guard, API error redaction and DNS authority guard. No orders."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import types
import unittest
from unittest.mock import patch

KIT=Path(__file__).resolve().parent
calls=[];replies=[]
class Session:
    def __init__(self):self.headers={}
    def post(self,url,**kwargs):
        calls.append((url,kwargs))
        value=replies.pop(0)
        return types.SimpleNamespace(status_code=200,json=lambda:value)
sys.modules['requests']=types.SimpleNamespace(Session=Session,RequestException=type("RequestException",(OSError,),{}))
spec=importlib.util.spec_from_file_location('sweb',KIT/'spaceweb_api.py');api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
class Installer(unittest.TestCase):
    def setUp(self):calls.clear();replies.clear()
    def test_auth_secrets_never_in_errors_or_urls(self):
        replies.append({'error':{'code':-32400,'message':'sensitive response'}})
        with self.assertRaises(api.APIError) as result:api.SpaceWeb('fixture','private-fixture-password')
        self.assertEqual(str(result.exception),'SpaceWeb API code -32400')
        self.assertEqual(calls[0][0],'https://api.sweb.ru/notAuthorized/')
        self.assertFalse(calls[0][1]['allow_redirects'])
        self.assertNotIn('private-fixture-password',calls[0][0])
    def test_dns_authority_and_dry_run(self):
        replies.append({'result':'private-fixture-token'});client=api.SpaceWeb('fixture','fixture')
        with patch.object(api.subprocess,'run',return_value=types.SimpleNamespace(stdout='ns1.yandexcloud.net.\nns2.yandexcloud.net.\n')):
            with self.assertRaises(api.APIError):client.edit_accounts('uchu-po-frp.ru',3,'192.0.2.1',True)
        self.assertEqual(len(calls),1)
        records={'result':[{'index':3,'name':'accounts','type':'A','value':'192.0.2.2'}]}
        replies.append(records)
        with patch.object(api.subprocess,'run',return_value=types.SimpleNamespace(stdout='ns1.spaceweb.ru.\nns2.spaceweb.ru.\n')):
            self.assertTrue(client.edit_accounts('uchu-po-frp.ru',3,'192.0.2.1')['dry_run'])
        self.assertEqual(calls[-1][1]['json']['method'],'info')
        replies.extend([records,{'result':True}])
        with patch.object(api.subprocess,'run',return_value=types.SimpleNamespace(stdout='ns1.spaceweb.ru.\n')):
            self.assertTrue(client.edit_accounts('uchu-po-frp.ru',3,'192.0.2.1',True))
        params=calls[-1][1]['json']['params'];self.assertEqual(params['name'],'accounts');self.assertEqual(params['action'],'edit')
    def test_installer_requires_immutable_ref_before_mutation(self):
        subprocess.run(['bash','-n',str(KIT/'install.sh')],check=True)
        result=subprocess.run(['bash',str(KIT/'install.sh'),'--ref','main'],capture_output=True,text=True)
        self.assertEqual(result.returncode,2);self.assertIn('40-character',result.stdout)
if __name__=='__main__':unittest.main(verbosity=2)
