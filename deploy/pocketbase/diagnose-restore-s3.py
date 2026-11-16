#!/usr/bin/env python3
"""Run offsite restore acceptance with only fixed diagnostic labels on failure."""
import importlib.util
import json
from pathlib import Path
import traceback

SAFE_REASONS = {
    'A successful verified upload is required first',
    'Upload acceptance is too old; upload a fresh snapshot first',
    'Unknown snapshot metadata', 'Unexpected snapshot size',
    'Downloaded ciphertext differs from the verified local snapshot',
    'Remote object exceeded the expected size',
    'Restore validation failed; output was kept private',
    'Expected a private regular file',
    'Unknown snapshot manifest; verify a fresh upload first',
    'Local ciphertext differs from the verified upload manifest',
}


def diagnostic(error):
    frames = traceback.extract_tb(error.__traceback__)
    own = [frame for frame in frames if Path(frame.filename).name in ('restore-s3-check.py', 'uchu-restore-s3.py')]
    code = getattr(error, 'response', {}).get('Error', {}).get('Code')
    return {'restore_failed': True, 'type': type(error).__name__ if type(error).__name__ in
            ('ValueError', 'FileNotFoundError', 'PermissionError', 'ClientError', 'AttributeError', 'TimeoutError') else 'other',
            'line': own[-1].lineno if own else None,
            'reason': str(error) if str(error) in SAFE_REASONS else 'not_printed',
            'provider_code': code if code in ('AccessDenied', 'SignatureDoesNotMatch', 'NoSuchKey', 'InvalidAccessKeyId') else None}


if __name__ == '__main__':
    path = Path('/root/uchu-restore-s3.py')
    spec = importlib.util.spec_from_file_location('restore', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    try:
        module.main()
    except Exception as error:
        print(json.dumps(diagnostic(error)))
