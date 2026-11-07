"""Target-only integration tests using two dedicated test accounts. No real users."""
import json
import os
import uuid
import urllib.request
import urllib.error

base = os.environ['ACCOUNTS_URL'].rstrip('/')
assert base.startswith('https://')
key = os.environ['ACCOUNTS_ANON_KEY']
assert os.environ.get('CONFIRM_TEST_TARGET') == 'yes'

def api(path, token=None, body=None, method=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=data, method=method,
        headers={'apikey': key, 'Authorization': 'Bearer ' + (token or key),
                 'Content-Type': 'application/json', 'Prefer': 'return=representation'})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        return e.code, None  # Never log server responses/tokens/passwords.

def login(prefix):
    status, result = api('/auth/v1/token?grant_type=password', body={
        'email': os.environ[prefix + '_EMAIL'], 'password': os.environ[prefix + '_PASSWORD']})
    assert status == 200, 'Login failed for dedicated account ' + prefix
    return result['access_token'], result['user']['id']

assert api('/auth/v1/health')[0] == 200
at, aid = login('TEST_A')
bt, bid = login('TEST_B')
assert aid != bid
ident = 'migration-test-' + uuid.uuid4().hex
path = '/rest/v1/lessons?id=eq.' + ident
try:
    assert api('/rest/v1/lessons', at, {'id': ident, 'user_id': aid, 'data': {'migration_test': True}})[0] in (200, 201)
    assert len(api(path, at)[1]) == 1
    assert api(path, bt)[1] == []
    status, rows = api(path)
    assert status in (200,401,403) and rows in (None, [])  # anon cannot read fixture.
    for body, method in (({'data': {'stolen': True}}, 'PATCH'), (None, 'DELETE')):
        status, rows = api(path, bt, body, method)
        assert status in (200,204,401,403) and rows in (None, [])
    assert api('/rest/v1/lessons', bt, {'id': ident + '-bad', 'user_id': aid, 'data': {}})[0] in (401,403)
    status, rows = api(path, at, {'user_id': bid}, 'PATCH')
    assert status in (401,403), 'Owner reassignment allowed'
    assert api(path, at)[1][0]['data'] == {'migration_test': True}
    assert api(path, at, {'data': {'migration_test': 'edited'}}, 'PATCH')[0] == 200
    assert api(path, at)[1][0]['data']['migration_test'] == 'edited'
finally:
    api(path, at, method='DELETE')
    api('/rest/v1/lessons?id=eq.' + ident + '-bad', at, method='DELETE')
assert api(path, at)[1] == []
print('PASS: health, two password logins, lesson CRUD, tenant isolation, blocked owner reassignment')
