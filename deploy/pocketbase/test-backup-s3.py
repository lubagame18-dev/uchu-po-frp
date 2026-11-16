"""Offline tests: bounded encrypted uploads, privacy gates and separate secret entry."""
import importlib.util
import io
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import Mock, patch

ROOT = Path(__file__).parent


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


backup = load('backup', 'backup-s3.py')
entry = load('backup_entry', 'enter-backup-secret.py')
restore = load('restore', 'restore-s3-check.py')
terminal = load('console_tests', 'test-oauth-secrets.py')


class S3:
    def __init__(self):
        self.objects = {}
        self.acl = {'Grants': []}
        self.versioning = {}
        self.corrupt = False
        self.puts = 0

    def get_bucket_acl(self, **kwargs):
        assert kwargs['Bucket'] == backup.BUCKET
        return self.acl

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


class Denied(Exception):
    response = {'ResponseMetadata': {'HTTPStatusCode': 403}, 'Error': {'Code': 'AccessDenied'}}


class Anonymous:
    public_list = False
    public_objects = False
    error = None

    def list_objects_v2(self, **kwargs):
        if self.error: raise self.error
        if not self.public_list: raise Denied()
        return {}

    def head_object(self, **kwargs):
        if self.error: raise self.error
        if not self.public_objects: raise Denied()
        return {}


class Backups(unittest.TestCase):
    def restore_fixture(self):
        marker = {'bucket': backup.BUCKET, 'key': 'pocketbase/slot-0.age', 'ok': True,
                  'anonymous_access_denied': True, 'verified_utc': datetime.now(timezone.utc).isoformat()}
        data = self.archive.read_bytes()
        marker.update(snapshot=self.archive.name, bytes=len(data), ciphertext_sha256=hashlib.sha256(data).hexdigest())
        client = Mock()
        client.get_object.return_value = {'Body': io.BytesIO(data), 'Metadata': {'snapshot': self.archive.name}, 'ContentLength': len(data)}
        return client, marker

    def test_remote_restore_uses_fresh_private_directory_and_cleans_it(self):
        client, marker = self.restore_fixture()
        def checker(command, **kwargs):
            downloaded, target = Path(command[2]), Path(command[4])
            self.assertEqual(downloaded.read_bytes(), self.archive.read_bytes())
            self.assertFalse(target.exists())
            self.assertNotEqual(target.parent, self.folder)
            self.assertEqual(target.parent.stat().st_mode & 0o077, 0)
            return subprocess.CompletedProcess(command, 0)
        with patch.object(restore.subprocess, 'run', side_effect=checker):
            result = restore.verify_restore(client, backup, marker, '/fixture/checker')
        self.assertTrue(result['restore_database_integrity_ok'])
        self.assertTrue(client.get_object.return_value['Body'].closed)

    def test_remote_restore_corruption_cannot_reach_decryption(self):
        client, marker = self.restore_fixture()
        data = self.archive.read_bytes()
        client.get_object.return_value['Body'] = io.BytesIO(data[:-1] + b'z')
        with patch.object(restore.subprocess, 'run') as runner:
            with self.assertRaises(ValueError): restore.verify_restore(client, backup, marker, '/fixture/checker')
            runner.assert_not_called()

    def test_remote_restore_cannot_traverse_snapshot_path(self):
        client, marker = self.restore_fixture()
        marker['snapshot'] = '../outside.age'
        with patch.object(restore.subprocess, 'run') as runner:
            with self.assertRaises(ValueError): restore.verify_restore(client, backup, marker, '/fixture/checker')
            runner.assert_not_called()

    def test_restore_works_without_optional_provider_metadata(self):
        client, marker = self.restore_fixture()
        client.get_object.return_value['Metadata'] = {}
        with patch.object(restore.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)):
            self.assertTrue(restore.verify_restore(client, backup, marker, '/fixture/checker')['download_sha256_verified'])

    def test_local_archive_must_match_private_upload_manifest(self):
        client, marker = self.restore_fixture()
        marker['ciphertext_sha256'] = '0' * 64
        with patch.object(restore.subprocess, 'run') as runner:
            with self.assertRaises(ValueError): restore.verify_restore(client, backup, marker, '/fixture/checker')
            runner.assert_not_called()

    def test_remote_restore_requires_recent_verified_upload(self):
        client, marker = self.restore_fixture()
        marker['verified_utc'] = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        with self.assertRaises(ValueError): restore.verify_restore(client, backup, marker, '/fixture/checker')
        client.get_object.assert_not_called()

    def test_failed_restore_does_not_report_success_or_retain_temporary_files(self):
        client, marker = self.restore_fixture()
        before = set(self.folder.parent.glob('uchu-offsite-restore-*'))
        with patch.object(restore.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1)):
            with self.assertRaises(ValueError): restore.verify_restore(client, backup, marker, '/fixture/checker')
        self.assertEqual(before, set(self.folder.parent.glob('uchu-offsite-restore-*')))

    def test_policy_uses_supported_yandex_actions_and_scoped_resources(self):
        # Contract from Yandex's S3 policy actions reference, not AWS's superset:
        # https://yandex.cloud/ru/docs/storage/s3/api-ref/policy/actions
        policy = json.loads((ROOT / 'backup-bucket-policy.example.json').read_text())
        actions = {action for rule in policy['Statement'] for action in rule['Action']}
        self.assertEqual(actions, {'s3:GetBucketAcl', 's3:GetBucketVersioning', 's3:ListBucket', 's3:GetObject', 's3:PutObject'})
        self.assertEqual(set(policy['Statement'][1]['Resource']), {f'arn:aws:s3:::uchu-frp-backups/{key}' for key in backup.SLOTS})

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = Path(self.tmp.name)
        self.previous = backup.BACKUPS
        self.previous_diagnostic = backup.DIAGNOSTIC
        backup.DIAGNOSTIC = self.folder / 'diagnostic.json'
        backup.BACKUPS = self.folder
        self.archive = self.folder / 'uchu-fixture.age'
        self.archive.write_bytes(b'age-encryption.org/v1\n' + b'fixture-ciphertext-' * 8)
        self.archive.chmod(0o600)
        self.client = S3()
        self.anonymous = Anonymous()

    def tearDown(self):
        backup.BACKUPS = self.previous
        backup.DIAGNOSTIC = self.previous_diagnostic
        self.tmp.cleanup()

    def test_failure_diagnostic_exposes_only_fixed_status_fields(self):
        class Error(Exception):
            response = {'Error': {'Code': 'AccessDenied', 'Message': 'fixture-private-secret'},
                        'ResponseMetadata': {'HTTPStatusCode': 403, 'HTTPHeaders': {'Authorization': 'fixture-private-secret'}}}
        def fail(): raise Error('fixture-private-secret')
        with self.assertRaises(Error): backup.checked('acl', fail)
        record = json.loads(backup.DIAGNOSTIC.read_text())
        self.assertEqual(record['stage'], 'acl')
        self.assertEqual(record['code'], 'AccessDenied')
        self.assertEqual(stat.S_IMODE(backup.DIAGNOSTIC.stat().st_mode), 0o600)
        self.assertNotIn('fixture-private-secret', backup.DIAGNOSTIC.read_text())

    def test_daily_slots_bound_retention_and_verify_download(self):
        for day in range(1, 12):
            result = backup.upload(self.client, self.anonymous, self.archive, datetime(2026, 11, day, tzinfo=timezone.utc))
            self.assertTrue(result['ciphertext_sha256_verified'])
            self.assertTrue(result['anonymous_access_denied'])
        self.assertEqual(set(self.client.objects), backup.SLOTS)
        self.assertEqual(self.client.puts, 11)

    def test_public_acl_and_anonymous_listing_refused_before_upload(self):
        self.client.acl = {'Grants': [{'Grantee': {'Type': 'Group', 'URI': 'http://acs.amazonaws.com/groups/global/AllUsers'}}]}
        with self.assertRaises(ValueError): backup.upload(self.client, self.anonymous, self.archive)
        self.client.acl = {'Grants': []}
        self.anonymous.public_list = True
        with self.assertRaises(ValueError): backup.upload(self.client, self.anonymous, self.archive)
        self.assertEqual(self.client.puts, 0)

    def test_public_existing_object_refused_before_replacement(self):
        self.client.objects['pocketbase/slot-0.age'] = b'existing ciphertext'
        self.anonymous.public_objects = True
        with self.assertRaises(ValueError): backup.upload(self.client, self.anonymous, self.archive)
        self.assertEqual(self.client.puts, 0)

    def test_new_object_public_access_is_not_accepted(self):
        self.anonymous.public_objects = True
        with self.assertRaises(ValueError): backup.upload(self.client, self.anonymous, self.archive)
        self.assertEqual(self.client.puts, 1)

    def test_network_error_cannot_count_as_anonymous_denial(self):
        self.anonymous.error = TimeoutError('fixture network failure')
        with self.assertRaises(TimeoutError): backup.upload(self.client, self.anonymous, self.archive)
        self.assertEqual(self.client.puts, 0)

    def test_version_history_and_unexpected_data_refused_without_deletion(self):
        for status in ('Enabled', 'Suspended'):
            self.client.versioning = {'Status': status}
            with self.assertRaises(ValueError): backup.upload(self.client, self.anonymous, self.archive)
        self.client.versioning = {}
        self.client.objects['unrelated-owner-file'] = b'preserve me'
        with self.assertRaises(ValueError): backup.upload(self.client, self.anonymous, self.archive)
        self.assertEqual(self.client.objects['unrelated-owner-file'], b'preserve me')
        self.assertEqual(self.client.puts, 0)

    def test_plaintext_public_file_symlink_and_size_refused(self):
        self.archive.write_bytes(b'plaintext with personal data' * 5)
        with self.assertRaises(ValueError): backup.upload(self.client, self.anonymous, self.archive)
        self.archive.write_bytes(b'age-encryption.org/v1\n' + b'x' * 32)
        self.archive.chmod(0o644)
        with self.assertRaises(ValueError): backup.upload(self.client, self.anonymous, self.archive)
        self.archive.chmod(0o600)
        link = self.folder / 'uchu-symlink.age'
        link.symlink_to(self.archive)
        with self.assertRaises(ValueError): backup.upload(self.client, self.anonymous, link)
        with self.archive.open('wb') as output: output.truncate(backup.MAX_BYTES + 1)
        with self.assertRaises(ValueError): backup.upload(self.client, self.anonymous, self.archive)
        self.assertEqual(self.client.puts, 0)

    def test_corrupted_download_is_not_accepted(self):
        self.client.corrupt = True
        with self.assertRaises(ValueError): backup.upload(self.client, self.anonymous, self.archive)

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
