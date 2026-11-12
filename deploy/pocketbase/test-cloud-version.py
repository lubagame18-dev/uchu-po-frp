"""Only request planning is tested; no cloud calls or real credentials."""
import base64,copy,importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('deploy',Path(__file__).with_name('cloud-version.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Planning(unittest.TestCase):
    def setUp(self):
        self.old={'id':'fixture-before','functionId':m.FUNCTION,'entrypoint':'yandex-function.handler','runtime':'nodejs22','resources':{'memory':'268435456'},'executionTimeout':'600s','concurrency':'1','environment':{'SUPABASE_URL':'https://fixture.invalid','SUPABASE_SERVICE_KEY':'fixture-private','GIGACHAT_KEY':'fixture-ai','YOOKASSA_KEY':'fixture-payment'},'logOptions':{'folderId':'fixture-folder'},'secrets':[{'id':'fixture-lockbox'}]}
    def test_stage_preserves_all_settings_and_old_environment(self):
        before=copy.deepcopy(self.old);body=m.staged_body(self.old,b'fixture-code',{'UCHU_SERVICE_TOKEN':'fixture-pb-'*8})
        for key in m.COPY_FIELDS:
            if key in self.old and key!='environment':self.assertEqual(body[key],self.old[key])
        for key,value in self.old['environment'].items():self.assertEqual(body['environment'][key],value)
        self.assertEqual(body['environment']['ACCOUNTS_BACKEND'],'supabase');self.assertEqual(base64.b64decode(body['content']),b'fixture-code');self.assertEqual(self.old,before)
    def test_wrong_function_or_missing_pb_secret_refused(self):
        with self.assertRaises(ValueError):m.staged_body(self.old,b'',{})
        self.old['functionId']='other'
        with self.assertRaises(ValueError):m.base_body(self.old)
    def test_rollback_plan_keeps_legacy_environment(self):
        body=m.base_body(self.old);self.assertNotIn('POCKETBASE_SERVICE_TOKEN',body['environment']);self.assertEqual(body['environment'],self.old['environment']);self.assertNotIn('content',body)
if __name__=='__main__':unittest.main(verbosity=2)
