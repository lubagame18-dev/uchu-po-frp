"""Owner promotion preserves credentials; trial and service-worker boundaries stay closed."""
import importlib.util,json,sqlite3,subprocess,tempfile,unittest
from pathlib import Path
KIT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('trial',KIT/'owner-trial.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class Promotion(unittest.TestCase):
    def database(self,path,users=0,verified=1):
        with sqlite3.connect(path) as c:
            c.execute('CREATE TABLE uchu_users(id TEXT,email TEXT,password TEXT,tokenKey TEXT,verified INTEGER)')
            c.execute('CREATE TABLE uchu_profiles(key TEXT,owner TEXT,payload TEXT)')
            for n in range(users):
                uid='fixture-owner-'+str(n);c.execute('INSERT INTO uchu_users VALUES(?,?,?,?,?)',(uid,'fixture@example.invalid','fixture-hash','fixture-record-key',verified));c.execute('INSERT INTO uchu_profiles VALUES(?,?,?)',(uid,uid,json.dumps({'id':uid,'plan':'free'})))
    def test_exact_auth_and_profile_copy(self):
        with tempfile.TemporaryDirectory() as tmp:
            s=Path(tmp)/'source';d=Path(tmp)/'primary';self.database(s,1);self.database(d)
            before=s.read_bytes();account=m.promote(s,d)
            self.assertEqual(account['password'],'fixture-hash');self.assertEqual(account['tokenKey'],'fixture-record-key');self.assertEqual(s.read_bytes(),before)
            with sqlite3.connect(d) as c:self.assertEqual(c.execute('SELECT count(*) FROM uchu_profiles').fetchone()[0],1)
    def test_extra_owner_unverified_or_nonempty_primary_refused(self):
        for count,verified,target in [(2,1,0),(1,0,0),(1,1,1)]:
            with tempfile.TemporaryDirectory() as tmp:
                s=Path(tmp)/'source';d=Path(tmp)/'primary';self.database(s,count,verified);self.database(d,target)
                with self.assertRaises(ValueError):m.promote(s,d)
                with sqlite3.connect(d) as c:self.assertEqual(c.execute('SELECT count(*) FROM uchu_users').fetchone()[0],target)
    def test_owner_trial_is_separate_from_full_launch(self):
        spec=importlib.util.spec_from_file_location('switch',KIT/'switch-accounts.py');sw=importlib.util.module_from_spec(spec);spec.loader.exec_module(sw)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'js').mkdir();(root/'index.html').write_text((KIT.parents[1]/'index.html').read_text());(root/'js/accounts-config.js').write_text('window.UCHU_ACCOUNTS=null;')
            gates={'owner_testing_authorized':True,'remote_health':True,'email_delivery':True,'login':True,'lesson_crud':True,'tenant_isolation':True,'exports':True,'proxy':True,'backup_restore':True,'source_inventory':True,'rollback':True,'registration_closed':True}
            report=root/'gates.json';report.write_text(json.dumps(gates));cmd=['python3',str(KIT/'switch-accounts.py'),'--root',str(root),'--url','https://accounts.example.invalid','--write','--acceptance-report',str(report)]
            self.assertNotEqual(subprocess.run(cmd,capture_output=True).returncode,0)
            subprocess.run(cmd+['--owner-test'],capture_output=True,check=True)
            self.assertIn('"ownerTesting": true',(root/'js/accounts-config.js').read_text())

if __name__=='__main__':unittest.main(verbosity=2)
