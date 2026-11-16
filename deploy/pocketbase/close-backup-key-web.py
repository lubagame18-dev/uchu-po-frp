#!/usr/bin/env python3
"""Remove only the checksum-matched temporary key-input route; preserve other Caddy changes."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile


def original_config(current, original, expected_hash):
    if hashlib.sha256(current).hexdigest() != expected_hash:
        raise ValueError('Caddy changed since setup; review before restoring')
    if b'uchu-pocketbase-managed' not in original or b'/private-backup-setup/' in original:
        raise ValueError('Original config does not match the managed account proxy')
    if b'handle /private-backup-setup/*' not in current:
        raise ValueError('Temporary route is not present')
    return original


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise ValueError('Run on the VPS as root')
    os.umask(0o077)
    config = Path('/etc/caddy/Caddyfile')
    backup = Path('/etc/caddy/Caddyfile.before-private-backup-setup')
    marker = Path('/run/uchu-backup-web-config.json')
    for path in (config, backup, marker):
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0:
            raise ValueError('Managed files must be regular root-owned files')
    wanted = original_config(config.read_bytes(), backup.read_bytes(), json.loads(marker.read_text())['installed_sha256'])
    fd, pending = tempfile.mkstemp(prefix='.close-private-input-', dir=config.parent)
    try:
        with os.fdopen(fd, 'wb') as output:
            os.fchmod(output.fileno(), 0o644)
            output.write(wanted)
            output.flush()
            os.fsync(output.fileno())
        result = subprocess.run(['caddy', 'validate', '--config', pending, '--adapter', 'caddyfile'],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
        if result.returncode:
            raise ValueError('Original Caddy config did not validate')
        if args.apply:
            subprocess.run(['systemctl', 'stop', 'uchu-backup-web.service'], check=True, timeout=30)
            os.replace(pending, config)
            subprocess.run(['systemctl', 'reload', 'caddy'], check=True, timeout=30)
            Path('/run/uchu-backup-private-link').unlink(missing_ok=True)
            marker.unlink()
        print(json.dumps({'configuration_guard_passed': True, 'original_config_valid': True, 'temporary_route_removed': args.apply}))
    finally:
        if os.path.exists(pending):
            os.unlink(pending)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Temporary-route cleanup paused; existing changes must be reviewed. No secrets printed.', file=sys.stderr)
        sys.exit(1)
