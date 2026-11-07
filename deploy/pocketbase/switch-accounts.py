"""Prepare PocketBase cutover, dry-run by default. Hosting is intentionally unspecified."""
import argparse
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]

def prepare(root, origin):
    url = urlsplit(origin)
    if url.scheme != 'https' or not url.hostname or url.username or url.password or url.path not in ('','/') or url.query or url.fragment:
        raise ValueError('Expected an HTTPS origin without credentials or path')
    config = {'provider':'pocketbase','url':origin.rstrip('/'),'anonKey':'','dashboard':origin.rstrip('/')+'/_/'}
    index = root/'index.html';old=index.read_text()
    changed,n=re.subn(r'accounts:\s*\{[^{}\n]*\}',lambda _:'accounts: '+json.dumps(config),old)
    if n!=1: raise ValueError('Expected exactly one accounts configuration')
    # SMS and Yandex ID are required by the owner; never silently disable them.
    changed=re.sub(r'phoneAuth:\s*(true|false)', 'phoneAuth: false', changed)
    shared='/* Public endpoint only. No service token here. */\nwindow.UCHU_ACCOUNTS = '+json.dumps(config)+';\n'
    changes={index:changed,root/'js/accounts-config.js':shared}
    for rel in ('test/index.html','taras-bulba/index.html','taras-bulba/results.html'):
        path=root/rel
        if not path.exists(): continue
        text=path.read_text()
        fallback=json.dumps({'url':origin.rstrip('/')+'/api/uchu','anonKey':'','key':'','lesson':'taras-bulba-2'})
        text,n=re.subn(r'(const CLOUD = window\.UCHU_ACCOUNTS[^\n]+? : )\{[^\n]+\};',lambda m:m[1]+fallback+';',text)
        if n!=1: raise ValueError('Standalone page config was not recognized: '+rel)
        changes[path]=text
    return changes

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--url',required=True)
    p.add_argument('--root',type=Path,default=ROOT)
    p.add_argument('--write',action='store_true')
    p.add_argument('--acceptance-report',type=Path,help='Required for --write: every named gate must be true')
    args=p.parse_args()
    changes=prepare(args.root,args.url)
    if args.write:
        if not args.acceptance_report: p.error('--write requires --acceptance-report')
        report=json.loads(args.acceptance_report.read_text())
        gates=['remote_health','email_delivery','login','lesson_crud','tenant_isolation','exports','proxy','payments','backup_restore','source_inventory','rollback','login_methods_reviewed','google_login','yandex_login','identity_linking']
        if any(report.get(g) is not True for g in gates): raise SystemExit('Acceptance gates are incomplete; site was not changed')
        backup=args.root/'work/pocketbase-cutover'
        backup.mkdir(parents=True,exist_ok=True)
        for path in changes:
            dest=backup/path.relative_to(args.root)
            if dest.exists(): raise SystemExit('Cutover backup exists; review it before another switch')
        for path in changes:
            dest=backup/path.relative_to(args.root);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(path.read_bytes())
        for path,text in changes.items(): path.write_text(text)
    print('Validated PocketBase account config; '+('written with rollback copy' if args.write else 'no files changed'))
