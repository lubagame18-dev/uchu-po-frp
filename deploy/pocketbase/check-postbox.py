#!/usr/bin/env python3
"""Verify SMTP TLS/auth without sending a message. Never print credential values."""
import json
import os
from pathlib import Path
import smtplib
import ssl
import stat


def check_smtp(values):
    key=values.get('UCHU_POSTBOX_API_KEY_ID','')
    secret=values.get('UCHU_POSTBOX_API_KEY_SECRET','')
    if not key or not secret:
        return {'smtp_authenticated':False,'error':'private_key_not_configured'}
    try:
        with smtplib.SMTP_SSL('postbox.cloud.yandex.net',465,timeout=15,context=ssl.create_default_context()) as client:
            client.ehlo()
            client.login(key,secret)
        return {'smtp_authenticated':True,'tls_verified':True,'email_sent':False}
    except smtplib.SMTPAuthenticationError as error:
        return {'smtp_authenticated':False,'error':'smtp_authentication_rejected','smtp_code':error.smtp_code}
    except Exception as error:
        return {'smtp_authenticated':False,'error':type(error).__name__}


def main():
    if os.geteuid()!=0:raise SystemExit('Run on the VPS as root')
    path=Path('/etc/pocketbase/pocketbase.env')
    info=path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o600:
        raise SystemExit('Private environment permissions are unsafe')
    values=dict(line.split('=',1) for line in path.read_text().splitlines() if line and not line.startswith('#'))
    result=check_smtp(values)
    print(json.dumps(result,sort_keys=True))
    if not result['smtp_authenticated']:raise SystemExit(1)

if __name__=='__main__':main()
