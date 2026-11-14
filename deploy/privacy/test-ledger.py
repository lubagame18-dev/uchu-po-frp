import importlib.util,json,sqlite3,tempfile,unittest,hashlib,hmac
from pathlib import Path
spec=importlib.util.spec_from_file_location('ledger',Path(__file__).with_name('ledger.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Ledger(unittest.TestCase):
 def test_signed_restore_removes_deleted_owner_and_preserves_other_and_trial(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);db=root/'data.db'
   with sqlite3.connect(db) as c:
    c.execute('create table uchu_users(id text,email text)');c.executemany('insert into uchu_users values(?,?)',[('deleted123','old@example.invalid'),('other456','other@example.invalid')])
    for name in ['lessons','trial_claims','deletions']:
     c.execute('create table uchu_'+name+'(id text,key text unique,owner text,payload text)')
    c.executemany('insert into uchu_lessons values(?,?,?,?)',[('one','one','deleted123','{}'),('two','two','other456','{}')])
   (root/'.privacy-review-required').touch();body={'version':1,'deletions':[{'key':'deleted123','owner':'','payload':{'deleted_at':'2026-11-13'}}],'trial_claims':[{'key':'opaque-hmac','owner':'','payload':{'expires':2000000000000}}]};secret=b'fixture-private-key'*3
   envelope={'ledger':body,'hmac':hmac.new(secret,m.canonical(body),hashlib.sha256).hexdigest()}
   invalid=dict(envelope,hmac='0'*64)
   with self.assertRaises(ValueError):m.apply(db,invalid,secret)
   self.assertTrue((root/'.privacy-review-required').exists())
   self.assertEqual(m.apply(db,envelope,secret),1)
   with sqlite3.connect(db) as c:
    self.assertEqual(c.execute('select id from uchu_users').fetchall(),[('other456',)])
    self.assertEqual(c.execute('select owner from uchu_lessons').fetchall(),[('other456',)])
    self.assertEqual(c.execute('select key from uchu_trial_claims').fetchall(),[('opaque-hmac',)])
   self.assertFalse((root/'.privacy-review-required').exists())
if __name__=='__main__':unittest.main(verbosity=2)
