#!/usr/bin/env python3
"""Read-only S3 diagnostics. Print only fixed status fields, never SDK messages or secrets."""
from importlib.machinery import SourceFileLoader
import importlib.util
import json
from pathlib import Path
import sys

SAFE_CODES = {'AccessDenied', 'SignatureDoesNotMatch', 'InvalidAccessKeyId', 'InvalidArgument',
              'NotImplemented', 'AuthorizationHeaderMalformed', 'NoSuchBucket',
              'RequestTimeTooSkewed', '403', '404'}


def error_status(error):
    response = getattr(error, 'response', {})
    code = response.get('Error', {}).get('Code')
    status = response.get('ResponseMetadata', {}).get('HTTPStatusCode')
    return {'error_code': code if code in SAFE_CODES else 'unclassified',
            'http_status': status if isinstance(status, int) and 100 <= status <= 599 else None}


def main():
    loader = SourceFileLoader('backup', '/usr/local/sbin/uchu-pocketbase-backup-s3')
    spec = importlib.util.spec_from_loader(loader.name, loader)
    backup = importlib.util.module_from_spec(spec)
    loader.exec_module(backup)
    config = backup.read_config(backup.CONFIG)
    import boto3
    from botocore.config import Config
    from botocore import UNSIGNED
    client = boto3.client('s3', endpoint_url='https://storage.yandexcloud.net', region_name='ru-central1',
                          aws_access_key_id=config['access_key_id'], aws_secret_access_key=config['secret_access_key'],
                          config=Config(signature_version='s3v4', connect_timeout=10, read_timeout=15,
                                        retries={'max_attempts': 0}, s3={'addressing_style': 'path'}))
    anonymous = boto3.client('s3', endpoint_url='https://storage.yandexcloud.net', region_name='ru-central1',
                             config=Config(signature_version=UNSIGNED, connect_timeout=10, read_timeout=15,
                                           retries={'max_attempts': 0}, s3={'addressing_style': 'path'}))
    operations = [
        ('acl', lambda: {'has_group_grants': any(g.get('Grantee', {}).get('Type') == 'Group' or bool(g.get('Grantee', {}).get('URI')) for g in client.get_bucket_acl(Bucket=backup.BUCKET).get('Grants', []))}),
        ('versioning', lambda: {'state': client.get_bucket_versioning(Bucket=backup.BUCKET).get('Status', 'not_enabled')}),
        ('list', lambda: {'object_count': len(client.list_objects_v2(Bucket=backup.BUCKET, MaxKeys=1000).get('Contents', []))}),
        ('anonymous_list', lambda: {'public': anonymous.list_objects_v2(Bucket=backup.BUCKET, MaxKeys=1) is not None}),
    ]
    for name, operation in operations:
        try:
            value = operation()
            if name == 'versioning' and value['state'] not in ('not_enabled', 'Enabled', 'Suspended'):
                value['state'] = 'unexpected'
            print(json.dumps({'operation': name, 'ok': True, **value}), flush=True)
        except Exception as error:
            print(json.dumps({'operation': name, 'ok': False, **error_status(error)}), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Read-only backup diagnostics paused; no values or response bodies printed.', file=sys.stderr)
        sys.exit(1)
