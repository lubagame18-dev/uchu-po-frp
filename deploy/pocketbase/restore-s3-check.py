#!/usr/bin/env python3
"""Download a verified offsite snapshot and restore only into a new private directory."""
from datetime import datetime, timezone
import hashlib
from importlib.machinery import SourceFileLoader
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def verify_restore(client, backup, marker, restore_command):
    if marker.get('bucket') != backup.BUCKET or marker.get('key') not in backup.SLOTS or marker.get('ok') is not True or marker.get('anonymous_access_denied') is not True:
        raise ValueError('A successful verified upload is required first')
    elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(marker['verified_utc'])).total_seconds()
    if not -300 <= elapsed <= 86400:
        raise ValueError('Upload acceptance is too old; upload a fresh snapshot first')
    response = client.get_object(Bucket=backup.BUCKET, Key=marker['key'])
    body = response['Body']
    try:
        snapshot = response.get('Metadata', {}).get('snapshot', '')
        if not re.fullmatch(r'uchu-[A-Za-z0-9_-]+\.age', snapshot):
            raise ValueError('Unknown snapshot metadata')
        local = backup.BACKUPS / snapshot
        info = backup.private_file(local)
        if not 32 <= info.st_size <= backup.MAX_BYTES or response.get('ContentLength') != info.st_size:
            raise ValueError('Unexpected snapshot size')
        with local.open('rb') as source:
            expected = hashlib.file_digest(source, 'sha256').hexdigest()
        with tempfile.TemporaryDirectory(prefix='uchu-offsite-restore-', dir=backup.BACKUPS.parent) as temporary:
            folder = Path(temporary)
            folder.chmod(0o700)
            downloaded = folder / 'snapshot.age'
            digest = hashlib.sha256()
            count = 0
            with downloaded.open('xb') as output:
                os.fchmod(output.fileno(), 0o600)
                while chunk := body.read(1024 * 1024):
                    count += len(chunk)
                    if count > info.st_size:
                        raise ValueError('Remote object exceeded the expected size')
                    digest.update(chunk)
                    output.write(chunk)
            if count != info.st_size or digest.hexdigest() != expected:
                raise ValueError('Downloaded ciphertext differs from the verified local snapshot')
            # Existing checker decrypts age and runs SQLite integrity_check. Never use a live path.
            result = subprocess.run([str(restore_command), '--archive', str(downloaded), '--to', str(folder / 'restored')],
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
            if result.returncode:
                raise ValueError('Restore validation failed; output was kept private')
    finally:
        body.close()
    return {'ok': True, 'bucket': backup.BUCKET, 'key': marker['key'], 'bytes': count,
            'download_sha256_verified': True, 'restore_database_integrity_ok': True,
            'restored_in_temporary_directory': True}


def main():
    if os.geteuid() != 0:
        raise ValueError('Run on the VPS as root')
    os.umask(0o077)
    source = Path(__file__).with_name('backup-s3.py')
    if not source.exists():
        source = Path('/usr/local/sbin/uchu-pocketbase-backup-s3')
    loader = SourceFileLoader('backup', str(source))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    backup = importlib.util.module_from_spec(spec)
    loader.exec_module(backup)
    import fcntl
    with open('/run/uchu-pocketbase-backup.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        config = backup.read_config(backup.CONFIG)
        marker_file = backup.BACKUPS / 'offsite-check.json'
        backup.private_file(marker_file)
        marker = json.loads(marker_file.read_text())
        import boto3
        from botocore.config import Config
        client = boto3.client('s3', endpoint_url='https://storage.yandexcloud.net', region_name='ru-central1',
                              aws_access_key_id=config['access_key_id'], aws_secret_access_key=config['secret_access_key'],
                              config=Config(signature_version='s3v4', connect_timeout=10, read_timeout=60,
                                            retries={'max_attempts': 2}, s3={'addressing_style': 'path'}))
        result = verify_restore(client, backup, marker, '/usr/local/sbin/uchu-pocketbase-restore-check')
        fd, pending = tempfile.mkstemp(prefix='.offsite-restore-', dir=backup.BACKUPS)
        try:
            with os.fdopen(fd, 'w') as output:
                json.dump(dict(result, verified_utc=datetime.now(timezone.utc).isoformat()), output)
                output.flush()
                os.fsync(output.fileno())
            os.replace(pending, backup.BACKUPS / 'offsite-restore-check.json')
        finally:
            if os.path.exists(pending):
                os.unlink(pending)
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Offsite restore check failed. Live data was not replaced; secrets and remote responses were not printed.', file=sys.stderr)
        sys.exit(1)
