#!/usr/bin/env python3
"""Upload only encrypted PocketBase snapshots to the owner's private RF bucket."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import tempfile

BUCKET = 'uchu-frp-backups'
CONFIG = Path('/etc/pocketbase/backup-s3.json')
BACKUPS = Path('/var/backups/pocketbase')
MAX_BYTES = 200 * 1024 * 1024
SLOTS = {f'pocketbase/slot-{i}.age' for i in range(3)}


def private_file(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o600:
        raise ValueError('Expected a private regular file')
    return info


def read_config(path):
    private_file(path)
    config = json.loads(path.read_text())
    if set(config) != {'bucket', 'access_key_id', 'secret_access_key'} or config['bucket'] != BUCKET:
        raise ValueError('Unexpected backup destination')
    if not all(isinstance(config[k], str) and 16 <= len(config[k]) <= 512 and not any(c.isspace() for c in config[k]) for k in ('access_key_id', 'secret_access_key')):
        raise ValueError('Invalid credentials')
    return config


def assert_private_bucket(client):
    acl = client.get_bucket_acl(Bucket=BUCKET)
    for grant in acl.get('Grants', []):
        who = grant.get('Grantee', {})
        if who.get('Type') == 'Group' or who.get('URI'):
            raise ValueError('Public or group bucket access is refused')
    try:
        policy = json.loads(client.get_bucket_policy(Bucket=BUCKET)['Policy'])
    except Exception as error:
        if getattr(error, 'response', {}).get('Error', {}).get('Code') != 'NoSuchBucketPolicy':
            raise
        policy = {}
    statements = policy.get('Statement', [])
    if isinstance(statements, dict):
        statements = [statements]
    for statement in statements:
        # Fail closed for anonymous Allow, even if a condition narrows it.
        principal = statement.get('Principal')
        if statement.get('Effect') == 'Allow' and '*' in json.dumps(principal):
            raise ValueError('Anonymous bucket policy is refused')
    if client.get_bucket_versioning(Bucket=BUCKET).get('Status'):
        raise ValueError('Versioning must never have been enabled for bounded retention')
    listing = client.list_objects_v2(Bucket=BUCKET, MaxKeys=1000)
    if listing.get('IsTruncated') or any(obj['Key'] not in SLOTS for obj in listing.get('Contents', [])):
        raise ValueError('Backup bucket contains unexpected objects; nothing deleted')


def upload(client, archive, now=None):
    info = private_file(archive)
    if archive.parent != BACKUPS or not archive.name.startswith('uchu-') or archive.suffix != '.age':
        raise ValueError('Only managed encrypted snapshots may be uploaded')
    if info.st_size > MAX_BYTES or info.st_size < 32:
        raise ValueError('Encrypted snapshot exceeds the configured size budget or is empty')
    # The caller holds the same lock as snapshot creation and local retention.
    with archive.open('rb') as source:
        if source.read(22) != b'age-encryption.org/v1\n':
            raise ValueError('Plaintext or unsupported snapshot refused')
        source.seek(0)
        digest = hashlib.file_digest(source, 'sha256').hexdigest()
        source.seek(0)
        assert_private_bucket(client)
        now = now or datetime.now(timezone.utc)
        key = f'pocketbase/slot-{int(now.timestamp()) // 86400 % 3}.age'
        client.put_object(Bucket=BUCKET, Key=key, Body=source, ContentLength=info.st_size,
                          # S3's default object ACL is private. No PutObjectAcl permission needed.
                          ContentType='application/octet-stream',
                          Metadata={'sha256': digest, 'snapshot': archive.name, 'created-utc': now.isoformat()})
    # Re-download the entire ciphertext: metadata alone does not prove bytes survived.
    response = client.get_object(Bucket=BUCKET, Key=key)
    remote = hashlib.sha256()
    count = 0
    body = response['Body']
    try:
        while chunk := body.read(1024 * 1024):
            count += len(chunk)
            if count > MAX_BYTES:
                raise ValueError('Remote object exceeds size budget')
            remote.update(chunk)
    finally:
        body.close()
    if count != info.st_size or remote.hexdigest() != digest:
        raise ValueError('Remote bytes did not match the local ciphertext')
    return {'ok': True, 'bucket': BUCKET, 'key': key, 'bytes': count, 'ciphertext_sha256_verified': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--if-configured', action='store_true')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise ValueError('Run as root on the VPS')
    os.umask(0o077)
    if args.if_configured and not CONFIG.exists():
        print(json.dumps({'offsite_enabled': False, 'reason': 'private credentials not configured'}))
        return
    config = read_config(CONFIG)
    import boto3
    from botocore.config import Config
    client = boto3.client('s3', endpoint_url='https://storage.yandexcloud.net', region_name='ru-central1',
                          aws_access_key_id=config['access_key_id'], aws_secret_access_key=config['secret_access_key'],
                          config=Config(signature_version='s3v4', connect_timeout=10, read_timeout=60,
                                        retries={'max_attempts': 2}, s3={'addressing_style': 'path'}))
    import fcntl
    with open('/run/uchu-pocketbase-backup.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        archive = max(BACKUPS.glob('uchu-*.age'))
        result = upload(client, archive)
        fd, temporary = tempfile.mkstemp(prefix='.offsite-', dir=BACKUPS)
        try:
            with os.fdopen(fd, 'w') as output:
                json.dump(dict(result, verified_utc=datetime.now(timezone.utc).isoformat()), output)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, BACKUPS / 'offsite-check.json')
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # SDK exceptions and response bodies may contain authentication material.
        print('Off-server backup failed; no credentials or response bodies printed. Local backup is retained.', file=sys.stderr)
        sys.exit(1)
