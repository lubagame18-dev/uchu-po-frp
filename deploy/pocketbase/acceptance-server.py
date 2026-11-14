#!/usr/bin/env python3
"""Owner-only acceptance proxy. Fixed loopback backend, separate DB; no credential logging."""
import argparse
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import hmac,json,os,re,secrets,time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request,build_opener,ProxyHandler

ORIGIN='https://accounts.uchu-po-frp.ru'
ROOT=Path('/opt/uchu-acceptance')
CONFIG=Path('/etc/pocketbase/acceptance.json')
AUDIT=Path('/var/lib/uchu-acceptance/results.jsonl')
ALLOWED=re.compile(r'/api/check/(?:auth/v1/(?:signup|token|logout|user|recover|resend|yandex_start|yandex_finish|google_start|google_finish)|rest/v1/(?:lessons|profiles)|native/(?:confirm-verification|confirm-password-reset))$')
CLIENT=build_opener(ProxyHandler({}))

class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup();self.connection.settimeout(20)
    def log_message(self,*args):pass
    def config(self):return json.loads(CONFIG.read_text())
    def authorized(self):
        try:
            c=self.config();cookie=SimpleCookie(self.headers.get('Cookie',''))
            return time.time()<c['expires'] and hmac.compare_digest(cookie['uchu_check'].value,c['session'])
        except Exception:return False
    def reply(self,status,body,kind='application/json',cookie=None):
        if not isinstance(body,bytes):body=json.dumps(body,ensure_ascii=False).encode()
        self.send_response(status)
        for k,v in {'Content-Type':kind,'Content-Length':str(len(body)),'Cache-Control':'no-store','Referrer-Policy':'same-origin','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}.items():self.send_header(k,v)
        if cookie:self.send_header('Set-Cookie',cookie)
        self.end_headers();self.wfile.write(body)
    def do_GET(self):self.handle_request()
    def do_POST(self):self.handle_request()
    def do_PATCH(self):self.handle_request()
    def do_DELETE(self):self.handle_request()
    def handle_request(self):
        try:self.process()
        except Exception:
            try:self.reply(502,{'message':'Проверка временно недоступна. Сообщите Codex.'})
            except Exception:pass
    def process(self):
        if self.headers.get('Host')!='accounts.uchu-po-frp.ru':return self.reply(403,{})
        path=self.path.split('?',1)[0]
        if self.command=='GET' and path in ('/check/','/check/verify','/check/reset','/google.html','/yandex.html','/check/app.js'):
            name='acceptance.js' if path=='/check/app.js' else 'acceptance.html'
            return self.reply(200,(ROOT/name).read_bytes(),'application/javascript; charset=utf-8' if name.endswith('.js') else 'text/html; charset=utf-8')
        if self.command not in ('GET',) and self.headers.get('Origin')!=ORIGIN:return self.reply(403,{})
        size=int(self.headers.get('Content-Length','0'))
        if not 0<=size<=65536:return self.reply(413,{})
        body=self.rfile.read(size) if size else None
        if self.command=='POST' and path=='/check/open':
            c=self.config();p=json.loads(body or b'{}');token=p.get('token','')
            if not isinstance(token,str) or set(p)!={'token'} or time.time()>=c['expires'] or not hmac.compare_digest(token,c['cap']):return self.reply(403,{})
            return self.reply(200,{},cookie='uchu_check='+c['session']+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400')
        if not self.authorized():return self.reply(403,{'message':'Откройте личную ссылку Codex.'})
        if path=='/check/status' and self.command=='GET':return self.reply(200,{'ok':True,'isolated':True})
        if not ALLOWED.fullmatch(path):return self.reply(404,{})
        dest=self.path.replace('/api/check/native/','/api/collections/uchu_users/',1) if '/native/' in path else self.path.replace('/api/check/','/api/uchu/',1)
        headers={'Content-Type':'application/json','Origin':ORIGIN}
        if self.headers.get('Authorization'):headers['Authorization']=self.headers['Authorization']
        try:r=CLIENT.open(Request('http://127.0.0.1:8092'+dest,data=body,headers=headers,method=self.command),timeout=20)
        except HTTPError as error:r=error
        with r:status=r.code;payload=r.read(1048577)
        if len(payload)>1048576:return self.reply(502,{})
        if self.command!='GET' and 200<=status<300:
            with AUDIT.open('a') as f:f.write(json.dumps({'at':int(time.time()),'path':path,'method':self.command,'status':status})+'\n')
        self.reply(status,payload)

if __name__=='__main__':
    os.umask(0o077)
    p=argparse.ArgumentParser();p.add_argument('action',choices=['serve','link']);a=p.parse_args()
    if a.action=='link':
        c={'cap':secrets.token_hex(24),'session':secrets.token_hex(32),'expires':time.time()+86400}
        CONFIG.write_text(json.dumps(c));CONFIG.chmod(0o600)
        target=Path('/run/uchu-acceptance-link');target.write_text(ORIGIN+'/check/#'+c['cap']+'\n');target.chmod(0o600)
        print('Owner link prepared for 24 hours in /run/uchu-acceptance-link. No provider secrets printed.')
    else:ThreadingHTTPServer(('127.0.0.1',8091),Handler).serve_forever()
