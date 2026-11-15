"""Server-owned lesson/token balances, migration safety and two-device browser checks."""
import concurrent.futures,importlib.util,json,os,shutil,sqlite3,subprocess,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('integration',Path(__file__).with_name('test-integration.py'));integration=importlib.util.module_from_spec(spec);spec.loader.exec_module(integration)
class Balances(unittest.TestCase):
 api=classmethod(integration.Accounts.api.__func__);start=classmethod(integration.Accounts.start.__func__)
 setUpClass=classmethod(integration.Accounts.setUpClass.__func__);tearDownClass=classmethod(integration.Accounts.tearDownClass.__func__)
 def profile(self,plan,left,limit,used=0,capacity=None):
  uid=self.users[0][0];p={'id':uid,'plan':plan,'ai_left':left,'ai_limit':capacity if capacity is not None else left,'tokens_limit':limit,'tokens_used':used,'paid_until':'2027-12-31T00:00:00Z'}
  self.assertEqual(self.api('/rest/v1/profiles',service=True,body=p)[0],201);return p
 def test_01_authorization_idempotency_tokens_and_exhaustion(self):
  uid,token=self.users[0];other=self.users[1][1];self.profile('ai',50,2700000,2470000,50)
  self.assertEqual(self.api('/rest/v1/rpc/consume_lesson',body={'lesson_id':'balance-0'})[0],401)
  for i in range(50):
   key='balance-'+str(i);body={'id':key,'user_id':uid,'data':{'docs':{'lesson':'# Counter fixture'}}}
   self.assertEqual(self.api('/rest/v1/lessons',token=token,body=body)[0],201)
   if i==0:
    self.assertEqual(self.api('/rest/v1/rpc/consume_lesson',token=other,body={'lesson_id':key})[0],403)
    with concurrent.futures.ThreadPoolExecutor(6) as pool:result=list(pool.map(lambda _:self.api('/rest/v1/rpc/consume_lesson',token=token,body={'lesson_id':key}),range(6)))
    self.assertTrue(all(s==200 and r['ai_left']==49 for s,r in result),result)
   else:self.assertEqual(self.api('/rest/v1/rpc/consume_lesson',token=token,body={'lesson_id':key})[1]['ai_left'],49-i)
  p=self.api('/rest/v1/profiles',token=token)[1][0];self.assertEqual(p['ai_left'],0);self.assertEqual(p['tokens_used'],2470000)
  # Existing material edits and token use never consume another lesson.
  self.assertEqual(self.api('/rest/v1/lessons?id=eq.balance-0',token=token,method='PATCH',body={'data':{'docs':{'lesson':'Updated fixture'}}})[0],200)
  self.assertEqual(self.api('/rest/v1/rpc/consume_lesson',token=token,body={'lesson_id':'balance-0'})[1]['ai_left'],0)
  self.assertTrue(self.api('/rest/v1/rpc/spend_ai',service=True,body={'p_id':uid,'p_tok':True,'p_tokens':50000})[1])
  p=self.api('/rest/v1/profiles',token=token)[1][0];self.assertEqual(p['ai_left'],0);self.assertEqual(p['tokens_used'],2520000)
  self.api('/rest/v1/lessons',token=token,body={'id':'balance-51','data':{'docs':{'lesson':'Fixture'}}})
  self.assertEqual(self.api('/rest/v1/rpc/consume_lesson',token=token,body={'lesson_id':'balance-51'})[0],402)
 def test_02_single_paid_units_and_no_trial_grant(self):
  uid,token=self.users[0];self.profile('none',0,0,0,0)
  self.api('/rest/v1/payments',service=True,body={'order_id':'balance-purchase-3','user_id':uid,'kind':'single_3','amount':90,'status':'created'})
  self.assertEqual(self.api('/rest/v1/rpc/apply_payment',service=True,body={'order_id':'balance-purchase-3','amount':90})[0],200)
  p=self.api('/rest/v1/profiles',token=token)[1][0];self.assertEqual((p['plan'],p['ai_left'],p['ai_limit'],p['tokens_limit']),('single',3,3,60000))
  self.api('/rest/v1/profiles',service=True,body={'id':uid,'plan':'free','ai_left':0})
  p=self.api('/rest/v1/profiles',token=token)[1][0];self.assertEqual((p['plan'],p['ai_left'],p['tokens_limit']),('single',3,60000))
  self.api('/rest/v1/lessons',token=token,body={'id':'single-balance','data':{'docs':{'lesson':'Fixture'}}})
  p=self.api('/rest/v1/rpc/consume_lesson',token=token,body={'lesson_id':'single-balance'})[1];self.assertEqual((p['ai_left'],p['ai_limit']),(2,3))
  status,u=self.api('/auth/v1/admin/users',service=True,body={'email':'no-trial-balance@example.invalid','password':self.password,'email_confirm':True});self.assertEqual(status,201,u)
  p=self.api('/rest/v1/profiles?id=eq.'+u['id'],service=True)[1][0];self.assertEqual((p['plan'],p['ai_left'],p['tokens_limit']),('none',0,0))
 def test_03_two_device_browser(self):
  if os.environ.get('POCKETBASE_BROWSER')!='1':self.skipTest('Set POCKETBASE_BROWSER=1')
  # Separate the browser flow from the preceding 50-lesson rapid-exhaustion fixture's rate window.
  self.proc.terminate();self.proc.wait(timeout=10);self.start()
  uid,token=self.users[0];self.profile('single',3,240000,10000,3)
  fixture={'base':self.base,'uid':uid,'token':token,'service':self.service,'email':'fixture-a@example.invalid','password':self.password}
  r=subprocess.run(['node',str(Path(__file__).with_name('test-balances-browser.cjs'))],input=json.dumps(fixture),text=True,capture_output=True,timeout=180)
  self.assertEqual(r.returncode,0,r.stdout+r.stderr)
class Migration(unittest.TestCase):
 def test_paid_budget_topup_keeps_spending_and_applies_once(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);m=root/'migrations';shutil.copytree(integration.KIT/'pb_migrations',m);new=m/'1794762000_payment_confirmations.js';new.unlink();data=root/'data'
   args=[str(integration.BINARY),'--dir',str(data),'--hooksDir',str(integration.KIT/'pb_hooks'),'--migrationsDir',str(m)]
   subprocess.run([*args,'migrate','up'],check=True,capture_output=True)
   with sqlite3.connect(data/'data.db') as c:
    p={'id':'paid-budget','plan':'single','ai_left':1,'tokens_limit':80000,'tokens_used':20000}
    c.execute('insert into uchu_profiles(id,key,owner,payload) values(?,?,?,?)',('paidbudgetrec01','paid-budget','paid-budget',json.dumps(p)))
    c.execute('insert into uchu_payments(id,key,owner,payload) values(?,?,?,?)',('budgetpayrecord','paid-order','paid-budget',json.dumps({'user_id':'paid-budget','kind':'single_1','status':'paid','amount':30})))
   shutil.copy(integration.KIT/'pb_migrations'/new.name,new)
   for _ in range(2):subprocess.run([*args,'migrate','up'],check=True,capture_output=True)
   with sqlite3.connect(data/'data.db') as c:
    p=json.loads(c.execute('select payload from uchu_profiles').fetchone()[0]);self.assertEqual((p['tokens_limit'],p['tokens_used'],p['ai_left'],p['creation_limit']),(80000,20000,1,120000))
 def test_trial_removal_preserves_paid_credits_and_materials(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);m=root/'migrations';shutil.copytree(integration.KIT/'pb_migrations',m);new=m/'1794758400_account_balances.js';new.unlink();data=root/'data'
   args=[str(integration.BINARY),'--dir',str(data),'--hooksDir',str(integration.KIT/'pb_hooks'),'--migrationsDir',str(m)]
   subprocess.run([*args,'migrate','up'],check=True,capture_output=True)
   with sqlite3.connect(data/'data.db') as c:
    for uid in ['trial-owner','paid-owner']:
     p={'id':uid,'plan':'free','ai_left':2,'tokens_limit':80000,'tokens_used':1234,'paid_until':None}
     c.execute('insert into uchu_profiles(id,key,owner,payload) values(?,?,?,?)',(uid,uid,uid,json.dumps(p)))
    c.execute('insert into uchu_payments(id,key,owner,payload) values(?,?,?,?)',('paymentrecord01','paid-order','paid-owner',json.dumps({'status':'paid','amount':30})))
    c.execute('insert into uchu_lessons(id,key,owner,payload) values(?,?,?,?)',('lessonrecord001','existing-lesson','trial-owner',json.dumps({'data':{'docs':{'lesson':'KEEP-MATERIAL'}}})))
   shutil.copy(integration.KIT/'pb_migrations'/new.name,new);subprocess.run([*args,'migrate','up'],check=True,capture_output=True)
   with sqlite3.connect(data/'data.db') as c:
    rows={key:json.loads(p) for key,p in c.execute('select key,payload from uchu_profiles')}
    self.assertEqual((rows['trial-owner']['plan'],rows['trial-owner']['ai_left'],rows['trial-owner']['tokens_limit']),('none',0,0))
    self.assertEqual((rows['paid-owner']['plan'],rows['paid-owner']['ai_left'],rows['paid-owner']['tokens_limit'],rows['paid-owner']['tokens_used']),('single',2,80000,1234))
    p,counted=c.execute('select payload,quota_counted from uchu_lessons').fetchone();self.assertIn('KEEP-MATERIAL',p);self.assertTrue(counted)
class Reservations(unittest.TestCase):
 api=classmethod(integration.Accounts.api.__func__);start=classmethod(integration.Accounts.start.__func__)
 setUpClass=classmethod(integration.Accounts.setUpClass.__func__);tearDownClass=classmethod(integration.Accounts.tearDownClass.__func__)
 def test_creation_spends_one_lesson_but_no_refinement_points(self):
  uid,token=self.users[0];self.api('/rest/v1/profiles',service=True,body={'id':uid,'plan':'single','ai_left':1,'tokens_limit':80000,'tokens_used':0,'creation_limit':120000,'creation_used':0})
  self.api('/rest/v1/lessons',token=token,body={'id':'creation-fixture','data':{'docs':{}}})
  request={'p_id':uid,'p_request':'a'*32,'p_tokens':10000,'p_phase':'creation','p_lesson':'creation-fixture'}
  self.assertEqual(self.api('/rest/v1/rpc/reserve_ai',service=True,body=request),(200,True))
  self.assertEqual(self.api('/rest/v1/rpc/settle_ai',service=True,body={**request,'p_tokens':4000}),(200,True))
  p=self.api('/rest/v1/profiles',token=token)[1][0];self.assertEqual((p['ai_left'],p['tokens_used'],p['creation_used']),(0,0,4000))
  self.api('/rest/v1/lessons?id=eq.creation-fixture',token=token,method='PATCH',body={'data':{'docs':{'lesson':'Completed fixture'}}})
  self.assertEqual(self.api('/rest/v1/rpc/consume_lesson',token=token,body={'lesson_id':'creation-fixture'})[1]['ai_left'],0)
  self.assertEqual(self.api('/rest/v1/rpc/reserve_ai',service=True,body={**request,'p_request':'b'*32})[0],403)
  self.assertEqual(self.api('/rest/v1/rpc/reserve_ai',service=True,body={'p_id':uid,'p_request':'c'*32,'p_tokens':1000}),(200,True))
  self.assertEqual(self.api('/rest/v1/profiles',token=token)[1][0]['tokens_used'],1000)
 def test_concurrent_reservations_refund_once_and_keep_spent_balance(self):
  uid,token=self.users[0];self.api('/rest/v1/profiles',service=True,body={'id':uid,'plan':'single','ai_left':1,'tokens_limit':20000,'tokens_used':0})
  self.assertEqual(self.api('/rest/v1/rpc/reserve_ai',token=token,body={'p_id':uid,'p_request':'a'*32,'p_tokens':10000})[0],403)
  def reserve(i):return i,self.api('/rest/v1/rpc/reserve_ai',service=True,body={'p_id':uid,'p_request':format(i,'032x'),'p_tokens':10000})
  with concurrent.futures.ThreadPoolExecutor(6) as pool:r=list(pool.map(reserve,range(6)))
  held=[i for i,(status,value) in r if status==200 and value is True];self.assertEqual(len(held),2,r)
  key=format(held[0],'032x');payload={'p_id':uid,'p_request':key,'p_tokens':4000}
  self.assertEqual(self.api('/rest/v1/rpc/settle_ai',service=True,body=payload),(200,True));self.assertEqual(self.api('/rest/v1/rpc/settle_ai',service=True,body=payload),(200,False))
  p=self.api('/rest/v1/profiles',token=token)[1][0];self.assertEqual(p['tokens_used'],14000);self.assertEqual(p['ai_left'],1)
  self.assertEqual(self.api('/rest/v1/rpc/reserve_ai',service=True,body={'p_id':uid,'p_request':'f'*32,'p_tokens':6001}),(200,False))
if __name__=='__main__':unittest.main(verbosity=2)
