"""Offline checks, no database or real credentials. Run from any directory."""
import base64
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('switch', BASE / 'switch-accounts.py')
switch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(switch)

def token(role):
    return 'test.' + base64.urlsafe_b64encode(json.dumps({'role': role}).encode()).decode().rstrip('=') + '.test'

class Checks(unittest.TestCase):
    def test_switch_and_rejections(self):
        old = (BASE.parents[1] / 'index.html').read_text()
        new = switch.prepare(old, 'https://supa.example.ru', token('anon'), 'https://studio.example.ru')
        self.assertEqual(old.split('  cloud:')[1].split('\n')[0], new.split('  cloud:')[1].split('\n')[0])
        self.assertIn('"url": "https://supa.example.ru"', new)
        for key in (token('service_role'), 'sb_secret_fake', '<ANON_KEY>'):
            with self.assertRaises(ValueError):
                switch.prepare(old, 'https://supa.example.ru', key, 'https://studio.example.ru')
        for url in ('http://supa.example.ru', 'https://user:pass@example.ru', 'https://example.ru/path'):
            with self.assertRaises(ValueError):
                switch.prepare(old, url, token('anon'), 'https://studio.example.ru')

    def test_configuration_against_pinned_upstream(self):
        # Fixtures fetched from the pinned tag by the local verification command.
        fixtures = BASE.parents[1] / 'work/supabase-docs'
        if not (fixtures / 'compose.yml').exists():
            self.skipTest('Pinned upstream fixtures absent; README describes fetching them')
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)
            (p / '.env').write_text((fixtures / 'env.example').read_text())
            (p / 'docker-compose.yml').write_text((fixtures / 'compose.yml').read_text())
            env = dict(os.environ, DOMAIN='supa.example.ru', STUDIO_DOMAIN='studio.example.ru', SITE_URL='https://example.ru')
            subprocess.run(['python3', str(BASE / 'configure.py')], cwd=p, env=env, check=True)
            text = (p / 'docker-compose.yml').read_text()
            self.assertEqual(text.count('- 127.0.0.1:'), 3)
            self.assertIn('ENABLE_PHONE_AUTOCONFIRM=false', (p / '.env').read_text())
            self.assertIn('ENABLE_EMAIL_SIGNUP=false', (p / '.env').read_text())
            self.assertTrue((p / '.uchu-initialized').exists())

    def test_shells_parse_and_guards(self):
        for path in BASE.glob('*.sh'):
            subprocess.run(['bash', '-n', str(path)], check=True)
        result = subprocess.run(['bash', str(BASE / 'restore.sh')], env={'PATH': os.environ['PATH']}, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        result = subprocess.run(['bash', str(BASE / 'migrate.sh'), 'import'], env=dict(os.environ, MIGRATION_DIR='/tmp/nonexistent', TARGET_DB_URL='test'), capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        for path in BASE.glob('*.py'):
            compile(path.read_text(), str(path), 'exec')

if __name__ == '__main__':
    unittest.main()
