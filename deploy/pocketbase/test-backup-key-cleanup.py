"""Guard against replacing unrelated proxy changes during temporary-route cleanup."""
import hashlib
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('cleanup', Path(__file__).with_name('close-backup-key-web.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Cleanup(unittest.TestCase):
    original = b'# uchu-pocketbase-managed\naccounts.uchu-po-frp.ru {\n}\n'
    temporary = b'# uchu-pocketbase-managed\naccounts.uchu-po-frp.ru {\nhandle /private-backup-setup/* {}\n}\n'

    def test_guard_returns_only_the_known_original(self):
        digest = hashlib.sha256(self.temporary).hexdigest()
        self.assertEqual(module.original_config(self.temporary, self.original, digest), self.original)

    def test_subsequent_proxy_change_is_preserved_by_refusal(self):
        digest = hashlib.sha256(self.temporary).hexdigest()
        with self.assertRaises(ValueError):
            module.original_config(self.temporary+b'new owner config', self.original, digest)

    def test_unknown_original_or_missing_route_is_refused(self):
        digest = hashlib.sha256(self.temporary).hexdigest()
        with self.assertRaises(ValueError): module.original_config(self.temporary, b'unrelated', digest)
        with self.assertRaises(ValueError): module.original_config(self.original, self.original, hashlib.sha256(self.original).hexdigest())


if __name__ == '__main__':
    unittest.main(verbosity=2)
