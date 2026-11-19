#!/usr/bin/env python3
"""Install the owner access panel PocketBase hooks from an immutable GitHub ref.

Run as root on the PocketBase VPS. No database migration is performed: only
pb_hooks/uchu.js and pb_hooks/uchu.pb.js are replaced, with rollback on failure.
"""
import argparse, hashlib, json, os, re, shutil, subprocess, time, traceback
from pathlib import Path
from urllib.request import urlopen
from urllib.error import HTTPError

ROOT = Path('/root/uchu-admin-panel-release')
KIT = Path('/opt/pocketbase')
DATA = Path('/var/lib/pocketbase')
BASE = 'https://raw.githubusercontent.com/lubagame18-dev/uchu-po-frp/'


def run(*args):
    r = subprocess.run(args, capture_output=True, timeout=240)
    if r.returncode:
        raise RuntimeError('Command failed: ' + args[0])


def fetch(ref, name):
    with urlopen(BASE + ref + '/' + name, timeout=40) as r:
        return r.read()


def probe_admin_route():
    """Without a session the protected endpoint must answer 403, not 404."""
    for _ in range(80):
        try:
            urlopen('http://127.0.0.1:8090/api/uchu/admin/v1/users', timeout=3)
        except HTTPError as e:
            if e.code == 403:
                return
        except OSError:
            pass
        time.sleep(.25)
    raise RuntimeError('Admin endpoint is not available after restart')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--ref', required=True, help='full 40-character commit SHA')
    a = p.parse_args()
    if os.geteuid() != 0:
        raise ValueError('Run as root')
    if not re.fullmatch(r'[0-9a-f]{40}', a.ref):
        raise ValueError('Use an immutable full commit SHA')
    ROOT.mkdir(mode=0o700, exist_ok=True)
    if (ROOT / 'receipt.json').exists():
        raise RuntimeError('This release is already installed; inspect receipt.json')

    manifest = json.loads(fetch(a.ref, 'deploy/admin-panel/release.json'))
    files = manifest.get('files') or {}
    expected = {'deploy/pocketbase/pb_hooks/uchu.js', 'deploy/pocketbase/pb_hooks/uchu.pb.js'}
    if set(files) != expected:
        raise ValueError('Unexpected release file list')

    stage = ROOT / 'stage'
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(mode=0o700)
    for name, wanted in files.items():
        value = fetch(a.ref, name)
        if hashlib.sha256(value).hexdigest() != wanted:
            raise ValueError('Source checksum mismatch: ' + name)
        (stage / Path(name).name).write_bytes(value)

    backup = ROOT / 'before'
    if backup.exists():
        shutil.rmtree(backup)
    backup.mkdir(mode=0o700)
    for name in files:
        src = KIT / 'pb_hooks' / Path(name).name
        if src.exists():
            shutil.copy2(src, backup / src.name)

    try:
        for name in files:
            dest = KIT / 'pb_hooks' / Path(name).name
            shutil.copyfile(stage / Path(name).name, dest)
            dest.chmod(0o644)
        run('systemctl', 'restart', 'pocketbase')
        probe_admin_route()
        run('systemctl', 'is-active', 'pocketbase')
    except Exception:
        run('systemctl', 'stop', 'pocketbase')
        for name in files:
            dest = KIT / 'pb_hooks' / Path(name).name
            old = backup / Path(name).name
            if old.exists():
                shutil.copy2(old, dest)
        run('systemctl', 'start', 'pocketbase')
        raise

    receipt = {
        'installed': True,
        'ref': a.ref,
        'version': manifest.get('version'),
        'files': list(files),
        'admin_route_checked': True,
        'environment_unchanged': True,
    }
    (ROOT / 'receipt.json').write_text(json.dumps(receipt))
    print(json.dumps(receipt))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        if ROOT.exists():
            (ROOT / 'failure.log').write_text(traceback.format_exc())
        print('Admin panel release stopped; inspect /root/uchu-admin-panel-release/failure.log')
        raise SystemExit(1)
