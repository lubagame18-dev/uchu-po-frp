#!/usr/bin/env python3
"""Separate masked S3 secret entry. Does not modify PocketBase or SMTP settings."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import tempfile

helper_path = Path(__file__).with_name('enter-oauth-secrets.py')
if not helper_path.exists():
    helper_path = Path('/root/uchu-private-login.py')
spec = importlib.util.spec_from_file_location('private_entry', helper_path)
entry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(entry)
DESTINATION = Path('/etc/pocketbase/backup-s3.json')


def save(path, key_id, secret):
    if not re.fullmatch(r'[A-Za-z0-9_-]{16,128}', key_id) or not re.fullmatch(r'[A-Za-z0-9/+=._-]{16,512}', secret):
        raise ValueError('Invalid static access key')
    if path.exists() or path.is_symlink():
        # Never replace another owner, a symlink, or an accidentally public file.
        info = path.lstat()
        import stat
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o600:
            raise ValueError('Unsafe existing configuration')
    fd, name = tempfile.mkstemp(prefix='.backup-s3-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as output:
            os.fchmod(output.fileno(), 0o600)
            json.dump({'bucket': 'uchu-frp-backups', 'access_key_id': key_id, 'secret_access_key': secret}, output)
            output.flush()
            os.fsync(output.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--access-key-id', required=True)
    args = parser.parse_args()
    if os.geteuid() != 0 or not sys.stdin.isatty() or not sys.stdout.isatty():
        raise ValueError('Use the private VPS console')
    entry.disable_echo()
    if not re.fullmatch(r'[A-Za-z0-9_-]{16,128}', args.access_key_id):
        raise ValueError('Invalid public access key ID')
    print('UCHU PRIVATE SETUP: BACKUP S3\nPaste only the S3 static access key SECRET. Stars only; Enter saves.', flush=True)
    while True:
        try:
            secret = entry.masked_input('BACKUP S3 SECRET (stars): ')
        except (KeyboardInterrupt, EOFError):
            print('\nForm stays open. Try again.', flush=True)
            continue
        if not re.fullmatch(r'[A-Za-z0-9/+=._-]{16,512}', secret):
            print('Empty or invalid input. Try again.', flush=True)
            continue
        save(DESTINATION, args.access_key_id, secret)
        del secret
        print('BACKUP KEY SAVED. Upload and restore are NOT verified yet. Do not paste anything else.', flush=True)
        return


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('BACKUP SETUP PAUSED. No values printed. Ask Codex to check it.', file=sys.stderr)
        if not sys.stdin.isatty() or not sys.stdout.isatty():
            sys.exit(1)
    except (KeyboardInterrupt, EOFError):
        print('BACKUP SETUP PAUSED.', file=sys.stderr)
    entry.park()
