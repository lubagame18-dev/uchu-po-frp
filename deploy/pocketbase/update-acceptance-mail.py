#!/usr/bin/env python3
"""Pinned UI/mail update. Sends at most one replacement to the sole unverified test account."""
import hashlib,json,os,shutil,sqlite3,subprocess,tempfile,time
from pathlib import Path
from urllib.request import Request,urlopen

REF='40988ccc4ca07b4aeb4c0d91446b5f26fec6bf3e'
HASHES={"acceptance.html":"f02c77c16835df11ba7d9537eec04f97b1fde65f692c0245552ffe330a1128d1","acceptance.js":"28927942ef3eccde543634d0c44e394445bc1777b6d201f72ec710614a66823c","acceptance-bootstrap.pb.js":"e3205cfda3ce6e904bf90200807afeea03c762e9d5f7472994a64d138ebabef5"}
ROOT=Path('/opt/uchu-acceptance')
DATA=Path('/var/lib/uchu-acceptance')

def update():
    if os.geteuid()!=0:raise ValueError('Root required')
    os.umask(0o077)
    if set(HASHES)!={'acceptance.html','acceptance.js','acceptance-bootstrap.pb.js'}:raise ValueError('Incomplete manifest')
    with tempfile.TemporaryDirectory(dir=ROOT,prefix='.mail-update-') as tmp:
        stage=Path(tmp)
        for name,checksum in HASHES.items():
            body=urlopen('https://raw.githubusercontent.com/lubagame18-dev/uchu-po-frp/'+REF+'/deploy/pocketbase/'+name,timeout=30).read()
            if hashlib.sha256(body).hexdigest()!=checksum:raise ValueError('Checksum mismatch')
            p=stage/name;p.write_bytes(body);p.chmod(0o644)
        backup=ROOT/'before-mail-update';backup.mkdir(mode=0o700,exist_ok=True)
        for name in HASHES:
            target=ROOT/name
            if not (backup/name).exists():shutil.copy(target,backup/name)
            os.replace(stage/name,target)
        hook=ROOT/'hooks'/'zz-acceptance.pb.js';shutil.copyfile(ROOT/'acceptance-bootstrap.pb.js',hook);hook.chmod(0o644)
    subprocess.run(['systemctl','restart','uchu-acceptance-backend.service'],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30)
    for n in range(30):
        try:
            with urlopen('http://127.0.0.1:8092/api/uchu/auth/v1/health',timeout=2) as r:assert r.status==200
            break
        except Exception:
            if n==29:raise RuntimeError('Acceptance health failed')
            time.sleep(.2)
    with sqlite3.connect('file:'+str(DATA/'data.db')+'?mode=ro',uri=True) as db:
        users=db.execute('SELECT email,verified FROM uchu_users').fetchall()
    if len(users)!=1:raise ValueError('Expected one owner test account; no mail sent')
    if users[0][1]:print(json.dumps({'updated':True,'already_verified':True,'replacement_sent':False}));return
    marker=DATA/'replacement-mail-attempt.json'
    if marker.exists():print(json.dumps({'updated':True,'replacement_already_attempted':True}));return
    marker.write_text(json.dumps({'attempted_at':int(time.time()),'source':REF}));marker.chmod(0o600)
    request=Request('http://127.0.0.1:8092/api/uchu/auth/v1/resend',data=json.dumps({'email':users[0][0]}).encode(),headers={'Content-Type':'application/json'},method='POST')
    with urlopen(request,timeout=25) as r:assert r.status==200
    marker.write_text(json.dumps({'attempted_at':int(time.time()),'source':REF,'smtp_request_accepted':True}))
    print(json.dumps({'updated':True,'replacement_mail_request_accepted':True,'production_unchanged':True}))

if __name__=='__main__':
    try:update()
    except Exception as error:
        print('Mail update paused: '+type(error).__name__+'. No addresses, tokens or credentials printed.')
        raise SystemExit(1)
