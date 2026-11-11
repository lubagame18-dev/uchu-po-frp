#!/usr/bin/env python3
"""Temporary, token-protected S3 key entry on loopback, behind the owner's HTTPS proxy."""
import argparse
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.machinery import SourceFileLoader
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
from threading import Lock
import time

ORIGIN = 'https://accounts.uchu-po-frp.ru'
PAGE = '/private-backup-setup/'
HTML = '''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Учу по ФРП — ключ резервных копий</title>
<style nonce="NONCE">body{font:17px/1.6 system-ui;background:#f3f4ed;color:#173b36;max-width:580px;margin:40px auto;padding:20px}input,button{font:inherit;box-sizing:border-box;width:100%;padding:14px;margin:10px 0;border:1px solid #b7c6ba;border-radius:8px}button{background:#225c50;color:white;cursor:pointer}button:disabled{opacity:.6}label{display:block;font-weight:600}p{overflow-wrap:anywhere}</style>
<h1>Ключ резервных копий</h1><p>Бакет: <b>uchu-frp-backups</b>. Вставьте секретный ключ S3 целиком из окна Яндекса. Можно использовать Ctrl+V или «Вставить» на телефоне.</p>
<form id="form"><label for="secret">Секретный ключ S3</label><input id="secret" type="password" minlength="16" maxlength="512" autocomplete="off" autocapitalize="off" spellcheck="false" required><button id="save">Проверить и сохранить</button></form><p id="status" role="status" aria-live="polite"></p><p>Ключ проверяется на сервере перед сохранением. Он не передаётся в чат, пульт или сторонние сервисы. Отправка резервной копии проверяется Codex отдельно.</p>
<script nonce="NONCE">'use strict';const token=location.hash.slice(1);history.replaceState(null,'',location.pathname);const form=document.querySelector('#form'),field=document.querySelector('#secret'),button=document.querySelector('#save'),status=document.querySelector('#status');if(!token){button.disabled=true;status.textContent='Откройте личную ссылку, которую прислал Codex.';}form.addEventListener('submit',async(e)=>{e.preventDefault();button.disabled=true;status.textContent='Проверяю доступ в Яндексе…';try{const response=await fetch('submit',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({secret:field.value}),cache:'no-store'});const result=await response.json();status.textContent=result.message;if(response.ok){field.value='';form.hidden=true;}else if(response.status===410){field.value='';form.hidden=true;}else button.disabled=false;}catch{status.textContent='Нет ответа сервера. Сообщите Codex; ключ в чат не отправляйте.';button.disabled=false;}});</script></html>'''


def load(name, path):
    loader = SourceFileLoader(name, str(path))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


def validate_and_save(key_id, secret):
    backup = load('backup', '/usr/local/sbin/uchu-pocketbase-backup-s3')
    import boto3
    from botocore import UNSIGNED
    from botocore.config import Config
    common = dict(endpoint_url='https://storage.yandexcloud.net', region_name='ru-central1')
    signed = boto3.client('s3', **common, aws_access_key_id=key_id, aws_secret_access_key=secret,
                          config=Config(signature_version='s3v4', connect_timeout=10, read_timeout=15,
                                        retries={'max_attempts': 0}, s3={'addressing_style': 'path'}))
    anonymous = boto3.client('s3', **common, config=Config(signature_version=UNSIGNED, connect_timeout=10,
                              read_timeout=15, retries={'max_attempts': 0}, s3={'addressing_style': 'path'}))
    backup.assert_private_bucket(signed, anonymous)
    entry = load('entry', '/root/uchu-private-backup.py')
    entry.save(Path('/etc/pocketbase/backup-s3.json'), key_id, secret)


def handler_for(state, validator):
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(20)

        # Neither paths, request bodies, headers, nor exceptions go to access logs.
        def log_message(self, *args):
            pass

        def reply(self, status, message, html=False):
            nonce = secrets.token_hex(16)
            body = (HTML.replace('NONCE', nonce) if html else json.dumps({'message': message}, ensure_ascii=False)).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'text/html; charset=utf-8' if html else 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('X-Frame-Options', 'DENY')
            self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'nonce-"+nonce+"'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path != PAGE or self.headers.get('Host') != 'accounts.uchu-po-frp.ru':
                self.reply(404, 'Страница не найдена.')
                return
            self.reply(200, '', html=True)

        def do_POST(self):
            if self.path != PAGE+'submit' or self.headers.get('Host') != 'accounts.uchu-po-frp.ru' or self.headers.get('Origin') != ORIGIN:
                self.reply(403, 'Запрос отклонён.')
                return
            authorization = self.headers.get('Authorization', '')
            if not hmac.compare_digest(authorization.encode(), ('Bearer '+state['token']).encode()):
                self.reply(403, 'Нужна личная ссылка Codex.')
                return
            with state['lock']:
                if state['used'] or time.monotonic() > state['expires'] or state['attempts'] >= 5:
                    self.reply(410, 'Ссылка закрыта или истекла. Сообщите Codex.')
                    return
                try:
                    size = int(self.headers.get('Content-Length', '0'))
                    if not 1 <= size <= 2048 or self.headers.get('Content-Type') != 'application/json':
                        raise ValueError()
                    payload = json.loads(self.rfile.read(size))
                    secret = payload.get('secret')
                    if set(payload) != {'secret'} or not isinstance(secret, str) or not re.fullmatch(r'[A-Za-z0-9/+=._-]{16,512}', secret):
                        raise ValueError()
                except Exception:
                    self.reply(400, 'Вставьте только секретный ключ целиком, без пробелов.')
                    return
                state['attempts'] += 1
                try:
                    validator(state['key_id'], secret)
                except Exception as error:
                    code = getattr(error, 'response', {}).get('Error', {}).get('Code')
                    if code in ('SignatureDoesNotMatch', 'InvalidAccessKeyId'):
                        message = 'Яндекс не подтвердил ключ. Скопируйте секретный ключ целиком из окна Яндекса и вставьте снова.'
                    else:
                        message = 'Проверка доступа не прошла. Сообщите Codex; ключ в чат не отправляйте.'
                    self.reply(400, message)
                    return
                finally:
                    del secret
                    payload.clear()
                state['used'] = True
                self.reply(200, 'Ключ проверен и сохранён. Закройте страницу и напишите Codex: «ключ сохранён».')
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--key-id', required=True)
    args = parser.parse_args()
    if os.geteuid() != 0 or not re.fullmatch(r'[A-Za-z0-9_-]{16,128}', args.key_id):
        raise ValueError('Use root and a public S3 access key ID')
    os.umask(0o077)
    state = {'key_id': args.key_id, 'token': secrets.token_hex(24), 'expires': time.monotonic()+1800,
             'attempts': 0, 'used': False, 'lock': Lock()}
    server = ThreadingHTTPServer(('127.0.0.1', 8091), handler_for(state, validate_and_save))
    # Capability URL is root-only, ephemeral, never committed or logged. Share only with the owner.
    link = Path('/run/uchu-backup-private-link')
    fd = os.open(link, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as output:
        os.fchmod(output.fileno(), 0o600)
        output.write(ORIGIN+PAGE+'#'+state['token']+'\n')
    print('Private S3 key form listening on loopback. No credentials or capability printed.', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    try:
        main()
    except Exception:
        raise SystemExit('Private input paused; no values or response bodies printed.')
