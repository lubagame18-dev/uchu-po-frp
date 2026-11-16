#!/usr/bin/env python3
"""Verify SMTP TLS/auth; optionally send one owner-requested test. Never print credentials."""
import argparse
import json
import re
from datetime import datetime,timezone
from email.message import EmailMessage
from email.utils import formatdate,make_msgid
import os
from pathlib import Path
import smtplib
import ssl
import stat


def check_smtp(values,recipient=None,reserve_path=None):
    key=values.get('UCHU_POSTBOX_API_KEY_ID','')
    secret=values.get('UCHU_POSTBOX_API_KEY_SECRET','')
    if not key or not secret:
        return {'smtp_authenticated':False,'error':'private_key_not_configured'}
    result={'smtp_authenticated':False,'email_sent':False}
    try:
        with smtplib.SMTP_SSL('postbox.cloud.yandex.net',465,timeout=15,context=ssl.create_default_context()) as client:
            client.ehlo()
            client.login(key,secret)
            result.update(smtp_authenticated=True,tls_verified=True)
            if recipient:
                if not re.fullmatch(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',recipient) or reserve_path is None:
                    raise ValueError('Invalid test configuration')
                # One explicit operator test, never an automatic repeated send.
                fd=os.open(reserve_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
                with os.fdopen(fd,'w') as f:f.write(datetime.now(timezone.utc).isoformat()+'\n')
                message=EmailMessage()
                message['From']='Учу по ФРП <accounts@uchu-po-frp.ru>'
                message['To']=recipient
                message['Subject']='Учу по ФРП — проверка служебной почты'
                message['Date']=formatdate(localtime=False)
                message['Message-ID']=make_msgid(domain='uchu-po-frp.ru')
                message.set_content('Это одно проверочное письмо сервиса «Учу по ФРП».\nПроверяем доставку служебных писем для нового кабинета.\nСайт: https://uchu-po-frp.ru/\n')
                refused=client.send_message(message)
                if refused:raise smtplib.SMTPRecipientsRefused(refused)
                result['email_sent']=True
        return result
    except smtplib.SMTPAuthenticationError as error:
        return {'smtp_authenticated':False,'error':'smtp_authentication_rejected','smtp_code':error.smtp_code}
    except Exception as error:
        result['error']=type(error).__name__
        return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--send-test-to',help='One owner-requested test recipient; guarded against repeat sends')
    args=parser.parse_args()
    if os.geteuid()!=0:raise SystemExit('Run on the VPS as root')
    path=Path('/etc/pocketbase/pocketbase.env')
    info=path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o600:
        raise SystemExit('Private environment permissions are unsafe')
    values=dict(line.split('=',1) for line in path.read_text().splitlines() if line and not line.startswith('#'))
    result=check_smtp(values,args.send_test_to,Path('/var/lib/pocketbase/uchu-smtp-test.reserved'))
    print(json.dumps(result,sort_keys=True))
    if not result['smtp_authenticated'] or result.get('error'):raise SystemExit(1)

if __name__=='__main__':main()
