"""Local HTTP tests for temporary secret entry. No real keys or cloud requests."""
import http.client
from http.server import ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
from threading import Lock, Thread
import time
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location('web', Path(__file__).with_name('backup-key-web.py'))
web = importlib.util.module_from_spec(spec)
spec.loader.exec_module(web)


class WebInput(unittest.TestCase):
    def setUp(self):
        self.state = {'key_id': 'fixture-public-key-id', 'token': 'fixture-private-token',
                      'expires': time.monotonic()+60, 'used': False, 'attempts': 0, 'lock': Lock()}
        self.validator = Mock()
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), web.handler_for(self.state, self.validator))
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)

    def request(self, method='POST', secret='fixture-secret-paste-123456', headers=None, payload=None):
        client = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        request_headers = {'Host': 'accounts.uchu-po-frp.ru', 'Origin': web.ORIGIN,
                           'Content-Type': 'application/json', 'Authorization': 'Bearer '+self.state['token']}
        request_headers.update(headers or {})
        body = json.dumps(payload if payload is not None else {'secret': secret}) if method == 'POST' else None
        client.request(method, web.PAGE+('submit' if method == 'POST' else ''), body=body, headers=request_headers)
        response = client.getresponse()
        result = response.status, dict(response.getheaders()), response.read().decode()
        client.close()
        return result

    def test_page_has_pasteable_password_field_without_token_or_secret(self):
        status, headers, body = self.request('GET')
        self.assertEqual(status, 200)
        self.assertIn('type="password"', body)
        self.assertIn('location.hash', body)
        self.assertNotIn(self.state['token'], body)
        self.assertNotIn('fixture-secret-paste-123456', body)
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertIn("frame-ancestors 'none'", headers['Content-Security-Policy'])
        self.assertNotIn("'unsafe-inline'", headers['Content-Security-Policy'])

    def test_authentication_and_origin_required_before_validation(self):
        for headers in ({'Authorization': ''}, {'Origin': 'https://unrelated.example'}, {'Host': 'unrelated.example'}):
            self.assertEqual(self.request(headers=headers)[0], 403)
        self.validator.assert_not_called()
        self.assertEqual(self.state['attempts'], 0)

    def test_wrong_signature_is_not_saved_or_echoed_and_can_retry(self):
        class SignatureError(Exception):
            response = {'Error': {'Code': 'SignatureDoesNotMatch', 'Message': 'fixture-secret-paste-123456'}}
        self.validator.side_effect = SignatureError('fixture-secret-paste-123456')
        status, _, body = self.request()
        self.assertEqual(status, 400)
        self.assertNotIn('fixture-secret-paste-123456', body)
        self.assertFalse(self.state['used'])
        self.validator.side_effect = None
        self.assertEqual(self.request()[0], 200)
        self.assertTrue(self.state['used'])

    def test_success_validates_exact_paste_and_token_is_single_use(self):
        status, _, body = self.request(secret='fixture-PASTED/secret+=123456')
        self.assertEqual(status, 200)
        self.assertNotIn('fixture-PASTED', body)
        self.validator.assert_called_once_with('fixture-public-key-id', 'fixture-PASTED/secret+=123456')
        self.assertEqual(self.request()[0], 410)
        self.validator.assert_called_once()

    def test_expiry_and_attempt_budget_close_form(self):
        self.state['expires'] = time.monotonic()-1
        self.assertEqual(self.request()[0], 410)
        self.state['expires'] = time.monotonic()+60
        self.state['attempts'] = 5
        self.assertEqual(self.request()[0], 410)
        self.validator.assert_not_called()

    def test_invalid_or_extra_fields_never_reach_validator(self):
        for payload in ({'secret': 'short'}, {'secret': 'fixture-valid-secret', 'key_id': 'another-id'}, {'secret': 'fixture secret with spaces'}):
            self.assertEqual(self.request(payload=payload)[0], 400)
        self.validator.assert_not_called()


if __name__ == '__main__':
    unittest.main(verbosity=2)
