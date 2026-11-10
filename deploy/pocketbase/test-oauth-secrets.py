"""Private file updates preserve flags and reject echoed/injected input."""
import importlib.util
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('entry',Path(__file__).with_name('enter-oauth-secrets.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class PrivateEntry(unittest.TestCase):
    def test_atomic_update_preserves_flags_and_mode(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'private.env';p.write_text('UCHU_ALLOW_SIGNUP=false\nUCHU_ALLOW_YANDEX=false\nYANDEX_CLIENT_SECRET=old\nPB_SETTINGS_KEY=fixture-key\n');p.chmod(0o600)
            module.update_environment(p,{'YANDEX_CLIENT_ID':'f'*32,'YANDEX_CLIENT_SECRET':'fixture-secret-123456'})
            self.assertEqual(stat.S_IMODE(p.stat().st_mode),0o600)
            self.assertIn('UCHU_ALLOW_YANDEX=false\n',p.read_text())
            self.assertIn('UCHU_ALLOW_SIGNUP=false\n',p.read_text())
            self.assertIn('PB_SETTINGS_KEY=fixture-key\n',p.read_text())
            self.assertEqual(p.read_text().count('YANDEX_CLIENT_SECRET='),1)
            self.assertEqual(list(Path(tmp).iterdir()),[p])
    def test_invalid_secret_or_permissions_cannot_modify_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'private.env';p.write_text('UCHU_ALLOW_SIGNUP=false\n');p.chmod(0o600);before=p.read_bytes()
            for value in ('short','fixture-secret-123456\nUCHU_ALLOW_SIGNUP=true','fixture secret 123456'):
                with self.assertRaises(ValueError):module.update_environment(p,{'YANDEX_CLIENT_SECRET':value})
                self.assertEqual(p.read_bytes(),before)
            p.chmod(0o644)
            with self.assertRaises(ValueError):module.update_environment(p,{'YANDEX_CLIENT_SECRET':'fixture-secret-123456'})
            self.assertEqual(p.read_bytes(),before)
    def test_non_terminal_refused_without_echo(self):
        fixture='fixture-secret-do-not-echo-123456'
        r=subprocess.run([sys.executable,str(Path(__file__).with_name('enter-oauth-secrets.py')),'--yandex-client-id','f'*32,'--google-client-id','fixture.apps.googleusercontent.com'],input=fixture,capture_output=True,text=True)
        self.assertNotEqual(r.returncode,0)
        self.assertNotIn(fixture,r.stdout+r.stderr)

if __name__=='__main__':unittest.main(verbosity=2)
