#!/usr/bin/env python3
"""Signed private deletion/trial ledger. Apply only to an offline restored copy."""
import argparse,hashlib,hmac,json,os,sqlite3,stat,tempfile
from pathlib import Path

def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':')).encode()
def key(path):
    if stat.S_IMODE(path.stat().st_mode)&0o077:raise ValueError('The key file must be private')
    env=dict(line.split('=',1) for line in path.read_text().splitlines() if line and not line.startswith('#'))
    value=env.get('UCHU_PRIVACY_HMAC_KEY') or env.get('UCHU_SERVICE_TOKEN','')
    if len(value)<32:raise ValueError('A private signing key is required')
    return value.encode()
def export(database):
    with sqlite3.connect('file:'+str(database)+'?mode=ro',uri=True) as c:
        if not c.execute("select 1 from sqlite_master where name='uchu_deletions'").fetchone():return {'version':1,'deletions':[],'trial_claims':[]}
        return {'version':1,**{name:[dict(key=k,owner=o,payload=json.loads(p)) for k,o,p in c.execute('select key,owner,payload from uchu_'+name)] for name in ['deletions','trial_claims']}}
def write(path,value):
    fd,tmp=tempfile.mkstemp(prefix='.privacy-ledger-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as f:os.fchmod(f.fileno(),0o600);f.write(canonical(value));f.flush();os.fsync(f.fileno())
        os.replace(tmp,path)
    finally:Path(tmp).unlink(missing_ok=True)
def apply(database,envelope,secret):
    body=envelope['ledger']
    if body.get('version')!=1 or not hmac.compare_digest(envelope['hmac'],hmac.new(secret,canonical(body),hashlib.sha256).hexdigest()):raise ValueError('Ledger signature mismatch')
    if database.resolve()==Path('/var/lib/pocketbase/data.db'):raise ValueError('Refusing to modify the live database')
    with sqlite3.connect('file:'+str(database)+'?mode=rw',uri=True) as c:
        existing={r[0] for r in c.execute("select name from sqlite_master where type='table'")}
        if body['deletions'] and 'uchu_deletions' not in existing:raise ValueError('Migrate the restored copy before applying deletion records')
        for r in body['deletions']:
            uid=r['key']
            email=c.execute('select email from uchu_users where id=?',(uid,)).fetchone() if 'uchu_users' in existing else None
            if email and 'uchu_site_admins' in existing:c.execute('delete from uchu_site_admins where key=?',(str(email[0]).lower(),))
            if 'uchu_login_state' in existing:c.execute("delete from uchu_login_state where key=? or json_extract(data,'$.owner')=?",('delete:'+uid,uid))
            if 'uchu_free_usage' in existing:c.execute("delete from uchu_free_usage where json_extract(payload,'$.key')=?",('u:'+uid,))
            if not isinstance(uid,str) or not uid.isalnum() or len(uid)>64:raise ValueError('Invalid deletion ID')
            for name in ['lessons','profiles','user_info','quizzes','quiz_questions','quiz_results','shared_materials','base_materials','bot_links']:
                if 'uchu_'+name in existing:c.execute('delete from uchu_'+name+' where owner=?',(uid,))
            c.execute('delete from uchu_users where id=?',(uid,))
        # Forward-migrate with matching hooks before starting the restored service. Never recreate native schemas here.
        if 'uchu_trial_claims' not in existing and body['trial_claims']:raise ValueError('Migrate the restored copy before importing trial protection')
        for r in body['deletions']:
            if 'uchu_deletions' not in existing:raise ValueError('Migrate the restored copy before applying deletion records')
            c.execute("insert into uchu_deletions(id,key,owner,payload) values(substr(lower(hex(randomblob(8))),1,15),?,?,?) on conflict(key) do update set payload=excluded.payload",(r['key'],r['owner'],json.dumps(r['payload'])))
        for r in body['trial_claims']:
            if not isinstance(r['key'],str) or len(r['key'])>200:raise ValueError('Invalid trial key')
            old=c.execute('select payload from uchu_trial_claims where key=?',(r['key'],)).fetchone()
            if old:c.execute('update uchu_trial_claims set owner=?,payload=? where key=?',(r['owner'],json.dumps(r['payload']),r['key']))
            else:c.execute('insert into uchu_trial_claims(id,key,owner,payload) values(substr(lower(hex(randomblob(8))),1,15),?,?,?)',(r['key'],r['owner'],json.dumps(r['payload'])))
        if c.execute('pragma integrity_check').fetchone()[0]!='ok':raise ValueError('Restored database integrity failed')
    (database.parent/'.privacy-review-required').unlink(missing_ok=True)
    return len(body['deletions'])
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('action',choices=['export','apply']);p.add_argument('--database',type=Path,required=True);p.add_argument('--key-file',type=Path,required=True);p.add_argument('--ledger',type=Path,required=True);a=p.parse_args();secret=key(a.key_file)
    if a.action=='export':
        body=export(a.database);write(a.ledger,{'ledger':body,'hmac':hmac.new(secret,canonical(body),hashlib.sha256).hexdigest()});print(json.dumps({'ledger_exported':True,'deletion_count':len(body['deletions'])}))
    else:print(json.dumps({'restored_copy_reviewed':True,'deletions_applied':apply(a.database,json.loads(a.ledger.read_text()),secret)}))
if __name__=='__main__':main()
