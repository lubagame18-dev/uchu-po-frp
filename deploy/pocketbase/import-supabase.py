"""Validate a private Supabase export. Dry-run default; imports only into a reviewed fresh target.
Input: {"users":[{"id":"uuid","email":"...","email_confirmed_at":"..."}],"tables":{"lessons":[...]}}
No password hashes are silently replaced: nonempty users require explicit reset approval.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import re
import urllib.request
import urllib.error
from urllib.parse import urlsplit

TABLES={'lessons':'id','profiles':'id','user_info':'id','payments':'order_id','quizzes':'id',
 'quiz_questions':'quiz_id','quiz_results':'id','shared_materials':'id','site_admins':'email','bot_links':'chat_id',
 'base_materials':'id','site_rules':'id','promo_codes':'code','ai_keys':'slot','img_keys':'slot','free_usage':'key'}

def phone_identity(user):
    value=str(user.get('phone') or '')
    if not value:return ''
    digits=re.sub(r'[^0-9]','',value)
    if not re.fullmatch(r'79[0-9]{9}',digits) or not user.get('phone_confirmed_at'):
        raise ValueError('Unverified or unsupported phone requires migration review')
    if user.get('email') and not user.get('email_confirmed_at'):
        raise ValueError('Verified phone with unverified email requires migration review')
    return '+'+digits

def validate(data):
    if not isinstance(data,dict) or not isinstance(data.get('users'),list) or not isinstance(data.get('tables'),dict):
        raise ValueError('Expected users array and tables object')
    users=data['users'];ids=set();emails=set();phones=set()
    for u in users:
        email=str(u.get('email') or '').strip().lower();phone=phone_identity(u)
        if not u.get('id') or not (email or phone) or (email and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email)):raise ValueError('Missing or invalid user identity')
        if u['id'] in ids or (email and email in emails) or (phone and phone in phones):raise ValueError('Duplicate user identity')
        ids.add(u['id'])
        if email:emails.add(email)
        if phone:phones.add(phone)
    for table,rows in data['tables'].items():
        if table not in TABLES: raise ValueError('Unreviewed source table: '+table)
        if not isinstance(rows,list): raise ValueError('Expected table rows')
        seen=set()
        for row in rows:
            key=(row.get(TABLES[table]),row.get('month') if table=='free_usage' else None)
            if not key[0] or key in seen: raise ValueError('Missing/duplicate key in '+table)
            seen.add(key)
            owner=row.get('user_id') if table not in ('profiles','user_info') else row.get('id')
            if owner and owner not in ids: raise ValueError('Orphan user reference in '+table)
    quizzes={r['id'] for r in data['tables'].get('quizzes',[])}
    for table in ('quiz_questions','quiz_results'):
        if any(r.get('quiz_id') not in quizzes for r in data['tables'].get(table,[])): raise ValueError('Orphan quiz reference')
    return {'users':len(users),'tables':{k:len(v) for k,v in data['tables'].items()}}

def api(base,secret,path,body=None):
    req=urllib.request.Request(base+'/api/uchu'+path,data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type':'application/json','apikey':secret})
    try:
        with urllib.request.urlopen(req,timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError('Target operation failed with HTTP '+str(e.code)+'; target must be reviewed/restored before retry') from None

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('export',type=Path);p.add_argument('--apply',action='store_true');p.add_argument('--allow-password-reset',action='store_true')
    p.add_argument('--empty-target-confirmed',action='store_true');args=p.parse_args()
    data=json.loads(args.export.read_text());summary=validate(data)
    print(json.dumps(summary)) # counts only, no PII or credentials
    if not args.apply: raise SystemExit('Dry run: no target was contacted')
    if not args.empty_target_confirmed: p.error('--apply requires --empty-target-confirmed and a tested target backup')
    if any(u.get('email') for u in data['users']) and not args.allow_password_reset: p.error('Existing email users require reviewed password reset plan; no passwords changed')
    base=os.environ['POCKETBASE_URL'].rstrip('/');secret=os.environ['POCKETBASE_SERVICE_TOKEN']
    url=urlsplit(base)
    if url.scheme!='https' or url.username or url.password or url.path not in ('','/') or url.query or url.fragment:
        raise SystemExit('Target must be an HTTPS origin')
    if len(secret)<32: raise SystemExit('Server secret is missing/too short')
    # This is intentionally not resumable or a destructive merge into existing data.
    inventory=api(base,secret,'/rest/v1/rpc/migration_inventory',{})
    if inventory['users'] or any(inventory['tables'].values()): raise SystemExit('Target contains data; import refused')
    mapping={}
    for u in data['users']:
        created=api(base,secret,'/auth/v1/admin/users',{'email':u.get('email') or '','phone':phone_identity(u),'password':secrets.token_urlsafe(48),
          'email_confirm':bool(u.get('email_confirmed_at')),'phone_confirm':bool(u.get('phone_confirmed_at')),'legacy_id':u['id']})
        mapping[u['id']]=created['id']
    # Retain external lesson/quiz/order IDs; change only references to user identities.
    for table in TABLES:
        transformed=[]
        for original in data['tables'].get(table,[]):
            row=dict(original)
            if row.get('user_id'): row['user_id']=mapping[row['user_id']]
            if table in ('profiles','user_info'): row['id']=mapping[row['id']]
            transformed.append(row)
        for start in range(0,len(transformed),50):
            api(base,secret,'/rest/v1/'+table,{'rows':transformed[start:start+50]})
    print('Import requests completed. Reconcile counts/links and reset flows before cutover. Source was not modified.')
