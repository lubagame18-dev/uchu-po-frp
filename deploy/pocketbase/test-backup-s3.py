"""Offline tests: bounded encrypted uploads, privacy gates and separate secret entry."""
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone

ROOT = Path(__file__).parent


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


backup = load('backup', 'backup-s3.py')
entry = load('backup_entry', 'enter-backup-secret.py')
terminal = load('console_tests', 'test-oauth-secrets.py')


class S3:
    def __init__(self):
        self.objects = {}
        self.acl = {'Grants': []}
        self.policy = {'Statement': []}
        self.versioning = {}
        self.corrupt = False
        self.puts = 0

    def get_bucket_acl(self, **kwargs):
        assert kwargs['Bucket'] == backup.BUCKET
        return self.acl

    def get_bucket_policy(self, **kwargs):
        return {'Policy': json.dumps(self.policy)}

    def get_bucket_versioning(self, **kwargs):
        return self.versioning

    def list_objects_v2(self, **kwargs):
        return {'Contents': [{'Key': key} for key in self.objects]}

    def put_object(self, **kwargs):
        assert kwargs['Bucket'] == backup.BUCKET
        assert 'ACL' not in kwargs  # default private ACL; never request a public ACL
        data = kwargs['Body'].read()
        assert len(data) == kwargs['ContentLength']
        self.objects[kwargs['Key']] = data
        self.puts += 1

    def get_object(self, **kwargs):
        data = self.objects[kwargs['Key']]
        return {'Body': io.BytesIO(data[:-1] if self.corrupt else data)}


class Backups(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = Path(self.tmp.name)
        self.previous = backup.BACKUPS
        backup.BACKUPS = self.folder
        self.archive = self.folder / 'uchu-fixture.age'
        self.archive.write_bytes(b'age-encryption.org/v1\n' + b'fixture-ciphertext-' * 8)
        self.archive.chmod(0o600)
        self.client = S3()

    def tearDown(self):
        backup.BACKUPS = self.previous
        self.tmp.cleanup()

    def test_daily_slots_bound_retention_and_verify_download(self):
        for day in range(1, 12):
            result = backup.upload(self.client, self.archive, datetime(2026, 11, day, tzinfo=timezone.utc))
            self.assertTrue(result['ciphertext_sha256_verified'])
        self.assertEqual(set(self.client.objects), backup.SLOTS)
        self.assertEqual(self.client.puts, 11)

    def test_public_acl_and_anonymous_policy_refused_before_upload(self):
        self.client.acl = {'Grants': [{'Grantee': {'Type': 'Group', 'URI': 'http://acs.amazonaws.com/groups/global/AllUsers'}}]}
        with self.assertRaises(ValueError): backup.upload(self.client, self.archive)
        self.client.acl = {'Grants': []}
        self.client.policy = {'Statement': [{'Effect': 'Allow', 'Principal': {'AWS': '*'}}]}
        with self.assertRaises(ValueError): backup.upload(self.client, self.archive)
        self.assertEqual(self.client.puts, 0)

    def test_version_history_and_unexpected_data_refused_without_deletion(self):
        for status in ('Enabled', 'Suspended'):
            self.client.versioning = {'Status': status}
            with self.assertRaises(ValueError): backup.upload(self.client, self.archive)
        self.client.versioning = {}
        self.client.objects['unrelated-owner-file'] = b'preserve me'
        with self.assertRaises(ValueError): backup.upload(self.client, self.archive)
        self.assertEqual(self.client.objects['unrelated-owner-file'], b'preserve me')
        self.assertEqual(self.client.puts, 0)

    def test_plaintext_public_file_symlink_and_size_refused(self):
        self.archive.write_bytes(b'plaintext with personal data' * 5)
        with self.assertRaises(ValueError): backup.upload(self.client, self.archive)
        self.archive.write_bytes(b'age-encryption.org/v1\n' + b'x' * 32)
        self.archive.chmod(0o644)
        with self.assertRaises(ValueError): backup.upload(self.client, self.archive)
        self.archive.chmod(0o600)
        link = self.folder / 'uchu-symlink.age'
        link.symlink_to(self.archive)
        with self.assertRaises(ValueError): backup.upload(self.client, link)
        with self.archive.open('wb') as output: output.truncate(backup.MAX_BYTES + 1)
        with self.assertRaises(ValueError): backup.upload(self.client, self.archive)
        self.assertEqual(self.client.puts, 0)

    def test_corrupted_download_is_not_accepted(self):
        self.client.corrupt = True
        with self.assertRaises(ValueError): backup.upload(self.client, self.archive)

    def test_credentials_are_separate_private_and_target_is_fixed(self):
        path = self.folder / 'backup-s3.json'
        entry.save(path, 'fixture-public-key-id', 'fixture-private-key-secret/+=')
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        self.assertEqual(backup.read_config(path)['bucket'], 'uchu-frp-backups')
        config = json.loads(path.read_text())
        config['bucket'] = 'uchu-po-frp.ru'
        path.write_text(json.dumps(config))
        with self.assertRaises(ValueError): backup.read_config(path)
        path.chmod(0o644)
        before = path.read_bytes()
        with self.assertRaises(ValueError): entry.save(path, 'fixture-public-key-id', 'fixture-private-key-secret')
        self.assertEqual(path.read_bytes(), before)

    def test_secret_entry_rejects_redirected_input_without_leaking(self):
        fixture = 'fixture-secret-must-not-be-printed'
        result = subprocess.run([sys.executable, str(ROOT / 'enter-backup-secret.py'), '--access-key-id', 'fixture-public-key-id'], input=fixture, text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(fixture, result.stdout + result.stderr)

    def test_real_terminal_retries_and_saves_without_echo(self):
        path = self.folder / 'backup-s3.json'
        code = "import importlib.util; spec=importlib.util.spec_from_file_location('backup_entry',sys.argv[2]); b=importlib.util.module_from_spec(spec); spec.loader.exec_module(b); b.DESTINATION=Path(sys.argv[3]); b.os.geteuid=lambda:0; sys.argv=['entry','--access-key-id','fixture-public-key-id']; b.main(); print('DONE')"
        t = terminal.Terminal(code, str(ROOT / 'enter-backup-secret.py'), str(path))
        try:
            t.until(b'BACKUP S3 SECRET (stars): ')
            t.send(b'\r')
            t.until(b'BACKUP S3 SECRET (stars): ', count=2)
            t.send(b'fixture-private-secret/+=123456\r')
            output = t.until(b'DONE')
            self.assertNotIn(b'fixture-private-secret', output)
            self.assertIn(b'BACKUP KEY SAVED', output)
            self.assertEqual(backup.read_config(path)['secret_access_key'], 'fixture-private-secret/+=123456')
        finally:
            t.close()


if __name__ == '__main__':
    unittest.main(verbosity=2)
