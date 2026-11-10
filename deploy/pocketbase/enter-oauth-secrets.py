#!/usr/bin/env python3
"""Hidden OAuth secret entry on the VPS console. No secrets in arguments or output."""
import argparse
import getpass
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import warnings

PROVIDERS = {
    'yandex': ('YANDEX_CLIENT_ID', 'YANDEX_CLIENT_SECRET', r'[a-f0-9]{32}'),
    'google': ('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', r'[A-Za-z0-9_-]+\.apps\.googleusercontent\.com'),
}

def update_environment(path, updates):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o600:
        raise ValueError('Environment must be a private regular file owned by the current user')
    for key, value in updates.items():
        if key not in {item for pair in PROVIDERS.values() for item in pair[:2]}:
            raise ValueError('Unsupported configuration key')
        if not re.fullmatch(r'[A-Za-z0-9._~-]{16,512}', value):
            raise ValueError('Invalid value; nothing was saved')
    lines = path.read_text().splitlines()
    kept = [line for line in lines if line.split('=', 1)[0] not in updates]
    payload = '\n'.join(kept + [key+'='+value for key,value in updates.items()])+'\n'
    fd, name = tempfile.mkstemp(prefix='.oauth-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as f:
            os.fchmod(f.fileno(), 0o600)
            f.write(payload)
            f.flush()
            os.fsync(f.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for provider in PROVIDERS:
        parser.add_argument('--'+provider+'-client-id', required=True)
    args = parser.parse_args()
    if os.geteuid() != 0 or not sys.stdin.isatty():
        raise ValueError('Use the root terminal on the VPS; redirected input is refused')
    # Never allow getpass to fall back to echoed stdin.
    warnings.simplefilter('error', getpass.GetPassWarning)
    path = Path('/etc/pocketbase/pocketbase.env')
    for provider, (id_key, secret_key, pattern) in PROVIDERS.items():
        client_id = getattr(args, provider+'_client_id')
        if not re.fullmatch(pattern, client_id):
            raise ValueError('Invalid public Client ID')
        print('\nUCHU PRIVATE SETUP: '+provider.upper(), flush=True)
        print('Paste ONLY this provider Client Secret. Input is hidden. Enter saves it.', flush=True)
        secret = getpass.getpass(provider.upper()+' CLIENT SECRET (hidden): ')
        update_environment(path, {id_key:client_id, secret_key:secret})
        del secret
        print(provider.upper()+': saved privately. Login/signup flags were not changed.', flush=True)
    subprocess.run(['systemctl','restart','pocketbase'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print('\nSAVED BOTH PROVIDERS. Service restarted. Do not paste anything else.', flush=True)
    print('Real OAuth login is NOT accepted yet; production website was not switched.', flush=True)

if __name__ == '__main__':
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print('\nEntry stopped. Already saved fields remain private; login/signup flags unchanged.', file=sys.stderr)
        sys.exit(1)
    except Exception:
        # Do not interpolate exception messages: they may contain supplied values.
        print('Private setup failed; no supplied values were printed. Ask Codex to check it.', file=sys.stderr)
        sys.exit(1)
