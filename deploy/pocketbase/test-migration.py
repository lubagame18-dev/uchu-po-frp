import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

KIT=Path(__file__).resolve().parent
ROOT=KIT.parents[1]
def module(filename):
    spec=importlib.util.spec_from_file_location(filename,KIT/filename);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

class Migration(unittest.TestCase):
    def test_export_validation(self):
        m=module('import-supabase.py')
        self.assertEqual(m.validate({'users':[],'tables':{}})['users'],0)
        with self.assertRaises(ValueError):m.validate({'users':[],'tables':{'unreviewed':[]}})
        with self.assertRaises(ValueError):m.validate({'users':[],'tables':{'lessons':[{'id':'fixture','user_id':'missing'}]}})
        with self.assertRaises(ValueError):m.validate({'users':[{'id':'old','email':None}],'tables':{}})
        with self.assertRaises(ValueError):m.validate({'users':[],'tables':{'quiz_results':[{'id':'fixture','quiz_id':'missing'}]}})
        phone={'id':'old-phone','phone':'79000000000','phone_confirmed_at':'verified'}
        self.assertEqual(m.validate({'users':[phone],'tables':{}})['users'],1)
        with self.assertRaises(ValueError):m.validate({'users':[dict(phone,phone_confirmed_at=None)],'tables':{}})
        with self.assertRaises(ValueError):m.validate({'users':[phone,dict(phone,id='duplicate')],'tables':{}})
        with self.assertRaises(ValueError):m.validate({'users':[dict(phone,email='unverified@example.invalid')],'tables':{}})

    def test_switch_guard_and_backup(self):
        m=module('switch-accounts.py')
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'js').mkdir()
            (root/'index.html').write_text((ROOT/'index.html').read_text())
            (root/'js/accounts-config.js').write_text('window.UCHU_ACCOUNTS=null;')
            original=(root/'index.html').read_text()
            cmd=['python3',str(KIT/'switch-accounts.py'),'--root',str(root),'--url','https://accounts.example.ru']
            subprocess.run(cmd,capture_output=True,check=True)
            self.assertEqual((root/'index.html').read_text(),original)
            r=subprocess.run(cmd+['--write'],capture_output=True);self.assertNotEqual(r.returncode,0)
            gates=json.loads((KIT/'acceptance.example.json').read_text());report=root/'acceptance.json';report.write_text(json.dumps(gates))
            r=subprocess.run(cmd+['--write','--acceptance-report',str(report)],capture_output=True);self.assertNotEqual(r.returncode,0)
            report.write_text(json.dumps({k:True for k in gates}))
            subprocess.run(cmd+['--write','--acceptance-report',str(report)],capture_output=True,check=True)
            updated=(root/'index.html').read_text()
            self.assertIn('"provider": "pocketbase"',updated)
            self.assertIn('phoneAuth: false',updated)
            self.assertEqual(original.split('  yandexFunction:')[1].splitlines()[0],updated.split('  yandexFunction:')[1].splitlines()[0])
            self.assertEqual((root/'work/pocketbase-cutover/index.html').read_text(),original)
            r=subprocess.run(cmd+['--write','--acceptance-report',str(report)],capture_output=True);self.assertNotEqual(r.returncode,0)

    def test_syntax(self):
        for f in KIT.glob('*.sh'):subprocess.run(['bash','-n',str(f)],check=True)
        for f in KIT.glob('*.py'):compile(f.read_text(),str(f),'exec')
        for f in (KIT/'pb_hooks').glob('*.js'):subprocess.run(['node','--check',str(f)],check=True)

if __name__=='__main__':unittest.main(verbosity=2)
