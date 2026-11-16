#!/usr/bin/env python3
"""Official SpaceWeb JSON-RPC client. Credentials stay in memory; no orders/payments."""
import os

# Optional server environment variables. Never put actual credentials in GitHub.
SWEB_LOGIN = os.environ.get('SWEB_LOGIN', '')
SWEB_PASSWORD = os.environ.get('SWEB_PASSWORD', '')

import argparse
import getpass
import ipaddress
import json
import subprocess
import sys
import requests

class APIError(RuntimeError):
    pass

class SpaceWeb:
    def __init__(self, login, password):
        self.session = requests.Session()
        self.session.headers.update({'Accept': 'application/json'})
        token = self.call('notAuthorized', 'getToken', {'login': login, 'password': password})
        if not isinstance(token, str) or not token:
            raise APIError('Authorization returned no token')
        self.session.headers['Authorization'] = 'Bearer ' + token

    def call(self, resource, method, params):
        allowed = {('notAuthorized','getToken'),('vps','index'),('pay','index'),
                   ('domains/dns','info'),('domains/dns','editMain')}
        if (resource, method) not in allowed:
            raise APIError('Operation is not supported')
        try:
            response = self.session.post('https://api.sweb.ru/'+resource+'/',
                json={'jsonrpc':'2.0','id':'uchu-setup','method':method,'params':params},
                timeout=25, allow_redirects=False)
            if response.status_code != 200:
                raise APIError('SpaceWeb HTTP '+str(response.status_code))
            body = response.json()
            if body.get('error'):
                code = body['error'].get('code', 'unknown')
                raise APIError('SpaceWeb API code '+str(code)+(' (2FA required)' if code == -32401 else ''))
            if 'result' not in body:
                raise APIError('Invalid API response')
            return body['result']
        except (requests.RequestException, ValueError) as exc:
            raise APIError('SpaceWeb connection/response failed; credentials were not logged') from None

    def edit_accounts(self, domain, index, address, apply=False):
        if domain != 'uchu-po-frp.ru':
            raise APIError('Only the configured project domain is permitted')
        address = str(ipaddress.IPv4Address(address))
        # A SpaceWeb registrar account cannot edit a DNS zone delegated to Yandex.
        ns = subprocess.run(['dig','+short','NS',domain],capture_output=True,text=True,check=True).stdout.lower().split()
        if not ns or not all(n.rstrip('.').endswith(('.spaceweb.ru','.spaceweb.pro')) for n in ns):
            raise APIError('DNS is not hosted by SpaceWeb. Use Yandex Cloud DNS; leave NS and existing records unchanged')
        records = self.call('domains/dns','info',{'domain':domain})
        def walk(value):
            if isinstance(value,dict):
                yield value
                for child in value.values(): yield from walk(child)
            elif isinstance(value,list):
                for child in value: yield from walk(child)
        # Fail closed if the API schema does not identify this existing accounts A record.
        if not any(str(r.get('index'))==str(index) and r.get('type')=='A' and
                   r.get('name') in ('accounts','accounts.'+domain) for r in walk(records)):
            raise APIError('Existing accounts A record could not be verified; no DNS changes made')
        params={'domain':domain,'action':'edit','index':index,'name':'accounts','type':'A','value':address}
        return self.call('domains/dns','editMain',params) if apply else {'dry_run':True,'params':params}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['check','dns','edit-accounts'])
    parser.add_argument('--domain',default='uchu-po-frp.ru')
    parser.add_argument('--index',type=int)
    parser.add_argument('--ip')
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--optional',action='store_true',help='Skip when login is blank')
    args=parser.parse_args()
    login=SWEB_LOGIN or input('SpaceWeb login (Enter to skip): ' if args.optional else 'SpaceWeb login: ')
    if args.optional and not login:
        print('SpaceWeb check skipped; no API calls made.');return
    password=SWEB_PASSWORD or getpass.getpass('SpaceWeb password (hidden): ')
    api=SpaceWeb(login,password);password=None
    if args.action=='check':
        servers=api.call('vps','index',{})
        print('SpaceWeb authorization succeeded; VPS inventory received. No orders or DNS changes made.')
    elif args.action=='dns':
        print(json.dumps(api.call('domains/dns','info',{'domain':args.domain}),ensure_ascii=False,indent=2))
    else:
        if args.index is None or not args.ip:parser.error('--index and --ip are required')
        print(json.dumps(api.edit_accounts(args.domain,args.index,args.ip,args.apply),ensure_ascii=False))

if __name__=='__main__':
    try: main()
    except (APIError, subprocess.SubprocessError, OSError, ValueError) as exc:
        print(str(exc) if isinstance(exc,APIError) else 'Local configuration failed; no credentials logged',file=sys.stderr)
        sys.exit(1)
