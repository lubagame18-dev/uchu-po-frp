import importlib.util
import io
import json
from pathlib import Path
import unittest
from urllib.parse import parse_qs

spec=importlib.util.spec_from_file_location('probe',Path(__file__).with_name('check-smspilot.py'));probe=importlib.util.module_from_spec(spec);spec.loader.exec_module(probe)

class SmsSetup(unittest.TestCase):
    def test_preflight_never_sends(self):
        values={'SMSPILOT_API_KEY':'F'*64};calls=[]
        def opener(request,timeout):
            self.assertEqual(request.full_url,'https://smspilot.ru/api.php');self.assertEqual(request.method,'POST');self.assertNotIn('apikey',request.full_url)
            body=parse_qs(request.data.decode());calls.append(body)
            self.assertTrue('balance' in body or body.get('cost')==['1'])
            return io.BytesIO(json.dumps({'balance':'20.00','cost':'8.58'}).encode())
        self.assertEqual(probe.check(values,opener=opener)['balance_rub'],'20.00')
        self.assertEqual(probe.check(values,'+79000000000',opener=opener)['cost_rub'],'8.58')
        self.assertEqual(calls[1]['cost'],['1']);self.assertNotIn('send',calls[0])
    def test_validation_and_redacted_errors(self):
        with self.assertRaises(ValueError):probe.request_data({})
        with self.assertRaises(ValueError):probe.request_data({'SMSPILOT_API_KEY':'F'*64},'+12025550100')
        with self.assertRaises(ValueError):probe.request_data({'SMSPILOT_API_KEY':'F'*64},'+79400000000')
        for response in [{'error':{'description':'DO-NOT-LOG-FIXTURE-SECRET'}},{'balance':'NaN'},{'balance':'-1'}]:
            with self.assertRaises(ValueError) as e:probe.check({'SMSPILOT_API_KEY':'F'*64},opener=lambda *a,**k:io.BytesIO(json.dumps(response).encode()))
            self.assertNotIn('DO-NOT-LOG',str(e.exception))

if __name__=='__main__':unittest.main(verbosity=2)
