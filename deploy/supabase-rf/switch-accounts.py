"""Prepare cutover only after live checks. Never changes cloud or AI proxy URL."""
import argparse
import base64
import json
from pathlib import Path
import re
from urllib.parse import urlsplit


def prepare(text, url, key, dashboard):
    def valid_url(value):
        p = urlsplit(value)
        return p.scheme == 'https' and p.hostname and not p.username and not p.password and p.path in ('', '/') and not p.query and not p.fragment
    if not valid_url(url) or not valid_url(dashboard):
        raise ValueError('Use HTTPS origin URLs')
    if key.startswith('sb_publishable_'):
        pass
    else:
        try:
            body = key.split('.')[1]
            role = json.loads(base64.urlsafe_b64decode(body + '=' * (-len(body) % 4)))['role']
        except Exception as e:
            raise ValueError('Expected public publishable key or anon JWT') from e
        if role != 'anon':
            raise ValueError('Only anon role is permitted in client')
    if any(x in key for x in ('<', '>', '\n', '\r')):
        raise ValueError('Invalid key')
    replacement = 'accounts: ' + json.dumps(dict(url=url.rstrip('/'), anonKey=key, dashboard=dashboard.rstrip('/')), ensure_ascii=False)
    updated, n = re.subn(r'accounts:\s*\{\s*url:\s*"[^"]*",\s*anonKey:\s*"[^"]*",\s*dashboard:\s*"[^"]*"\s*\}', lambda _: replacement, text)
    if n != 1:
        raise ValueError('Expected exactly one accounts configuration')
    return updated

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', required=True)
    parser.add_argument('--dashboard', required=True)
    parser.add_argument('--key-file', type=Path, required=True, help='Public anon key only')
    parser.add_argument('--index', type=Path, default=Path(__file__).resolve().parents[2] / 'index.html')
    parser.add_argument('--write', action='store_true', help='Default is validation only')
    args = parser.parse_args()
    old = args.index.read_text()
    new = prepare(old, args.url, args.key_file.read_text().strip(), args.dashboard)
    if args.write:
        backup = args.index.with_suffix('.html.before-accounts')
        if backup.exists():
            raise SystemExit('Backup already exists; review it before another switch')
        backup.write_text(old)
        args.index.write_text(new)
    print('Accounts configuration validated' + (' and written; backup created' if args.write else '; no files changed (use --write after live checks)'))
