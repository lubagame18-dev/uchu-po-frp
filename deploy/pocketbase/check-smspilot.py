"""Read SMSPILOT balance or estimate the login SMS price. Never sends an SMS."""
import argparse
from decimal import Decimal, InvalidOperation
import json
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request

ENDPOINT='https://smspilot.ru/api.php'

def request_data(values, phone=None):
    key=values.get('SMSPILOT_API_KEY','')
    if not re.fullmatch(r'[a-zA-Z0-9]{64}',key):raise ValueError('SMSPILOT_API_KEY is missing or invalid')
    body={'apikey':key,'format':'json'}
    if phone is None:body['balance']='rur'
    else:
        digits=re.sub(r'[^0-9]','',phone)
        if not re.fullmatch(r'79[0-9]{9}',digits) or digits.startswith('7940'):raise ValueError('Expected a Russian mobile number +79xxxxxxxxx')
        body.update(to=digits,send='Код входа в «Учу по ФРП»: 000000',cost='1')
        if values.get('SMS_SENDER'):body['from']=values['SMS_SENDER']
    return body

def check(values, phone=None, opener=urllib.request.urlopen):
    body=request_data(values,phone)
    request=urllib.request.Request(ENDPOINT,data=urllib.parse.urlencode(body).encode(),headers={'Content-Type':'application/x-www-form-urlencoded'},method='POST')
    try:
        with opener(request,timeout=20) as response:result=json.load(response)
    except (urllib.error.URLError,TimeoutError,ValueError):raise ValueError('SMSPILOT preflight failed; no SMS send was requested') from None
    field='cost' if phone is not None else 'balance'
    if not isinstance(result,dict) or result.get('error'):raise ValueError('SMSPILOT rejected the preflight; check the account and API key')
    try:value=Decimal(str(result[field]))
    except (KeyError,InvalidOperation,ValueError):raise ValueError('Invalid numeric provider response') from None
    if not value.is_finite() or value<0:raise ValueError('Invalid numeric provider response')
    return {field+'_rub':str(value),'sms_send_requested':False}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--env-file',type=Path,required=True);p.add_argument('--phone',help='Optional owner test number for cost=1 only; no sending');args=p.parse_args()
    if args.env_file.stat().st_mode & 0o077:raise SystemExit('Environment file must have permissions 600')
    values={}
    for line in args.env_file.read_text().splitlines():
        if line and not line.startswith('#'):
            key,value=line.split('=',1);values[key]=value
    try:print(json.dumps(check(values,args.phone)))
    except ValueError as e:raise SystemExit(str(e))
