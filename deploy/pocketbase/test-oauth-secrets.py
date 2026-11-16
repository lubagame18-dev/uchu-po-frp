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
    def test_postbox_entry_preserves_oauth_and_signup_flags(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'private.env';p.write_text('YANDEX_CLIENT_SECRET=fixture-yandex-secret\nGOOGLE_CLIENT_SECRET=fixture-google-secret\nUCHU_ALLOW_SIGNUP=false\n');p.chmod(0o600)
            module.update_environment(p,{'UCHU_POSTBOX_API_KEY_ID':'fixture-postbox-key-id','UCHU_POSTBOX_API_KEY_SECRET':'fixture-postbox-secret-123456'})
            data=p.read_text()
            self.assertIn('YANDEX_CLIENT_SECRET=fixture-yandex-secret\n',data)
            self.assertIn('GOOGLE_CLIENT_SECRET=fixture-google-secret\n',data)
            self.assertIn('UCHU_ALLOW_SIGNUP=false\n',data)
            self.assertIn('UCHU_POSTBOX_API_KEY_SECRET=fixture-postbox-secret-123456\n',data)

    def test_non_terminal_refused_without_echo(self):
        fixture='fixture-secret-do-not-echo-123456'
        r=subprocess.run([sys.executable,str(Path(__file__).with_name('enter-oauth-secrets.py')),'--yandex-client-id','f'*32,'--google-client-id','fixture.apps.googleusercontent.com'],input=fixture,capture_output=True,text=True)
        self.assertNotEqual(r.returncode,0)
        self.assertNotIn(fixture,r.stdout+r.stderr)


# Tests below use a real PTY, including terminal echo behavior.
import pty
import select
import time

class Terminal:
    def __init__(self, code, *args):
        self.master, slave=pty.openpty()
        entry=str(Path(__file__).with_name('enter-oauth-secrets.py'))
        prefix="import importlib.util,sys; from pathlib import Path; spec=importlib.util.spec_from_file_location('entry',sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); "
        self.proc=subprocess.Popen([sys.executable,'-c',prefix+code,entry,*args],stdin=slave,stdout=slave,stderr=slave,start_new_session=True)
        os.close(slave);self.output=b''
    def until(self, marker, count=1):
        deadline=time.monotonic()+5
        while self.output.count(marker)<count:
            if time.monotonic()>deadline:raise AssertionError('Terminal did not reach expected prompt')
            if select.select([self.master],[],[],.1)[0]:
                try:data=os.read(self.master,65536)
                except OSError:break
                if not data:break
                self.output+=data
        if self.output.count(marker)<count:raise AssertionError('Expected terminal marker was absent')
        return self.output
    def send(self, data):os.write(self.master,data)
    def close(self):
        if self.proc.poll() is None:self.proc.terminate()
        self.proc.wait(timeout=5);os.close(self.master)

class ConsoleInput(unittest.TestCase):
    def test_mask_editing_without_secret_echo(self):
        value='fixture-terminal-secret-123456'
        t=Terminal("v=m.masked_input('TEST STARS: '); assert v=='fixture-terminal-secret-123456'; print('DONE')")
        try:
            t.until(b'TEST STARS: ');t.send(b'abx\x7f\x15'+value.encode()+b'\r');out=t.until(b'DONE')
            self.assertIn(b'***',out);self.assertNotIn(value.encode(),out)
        finally:t.close()
    def test_empty_input_retries_in_same_form(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'private.env';p.write_text('UCHU_ALLOW_SIGNUP=false\n');p.chmod(0o600)
            t=Terminal("m.collect_secret(Path(sys.argv[2]),'yandex','f'*32); print('DONE')",str(p))
            try:
                t.until(b'(stars): ');t.send(b'\r');t.until(b'Empty or invalid input.')
                # Wait for the new prompt before entering the value, avoiding the input flush.
                t.until(b'(stars): ',count=2)
                t.send(b'fixture-retry-secret-123456\r');out=t.until(b'DONE')
                self.assertNotIn(b'fixture-retry-secret-123456',out)
                self.assertIn('UCHU_ALLOW_SIGNUP=false\n',p.read_text())
                self.assertIn('YANDEX_CLIENT_SECRET=fixture-retry-secret-123456\n',p.read_text())
            finally:t.close()
    def test_success_screen_keeps_terminal_out_of_shell(self):
        t=Terminal('m.park()')
        try:
            t.until(b'CLOSED (nothing else will be saved): ')
            t.send(b'fixture-accidental-secret-123456\r')
            out=t.until(b'CLOSED (nothing else will be saved): ',count=2)
            self.assertIsNone(t.proc.poll());self.assertNotIn(b'fixture-accidental-secret-123456',out)
        finally:t.close()

if __name__=='__main__':unittest.main(verbosity=2)
