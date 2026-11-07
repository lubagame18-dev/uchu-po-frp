"""Bootstrap helper; run only on target VPS, no secrets printed."""
import os
from pathlib import Path
import re
import subprocess
import sys

p = Path('.env')
s = p.read_text()
def values():
    return dict(line.split('=', 1) for line in s.splitlines() if line and not line.startswith('#') and '=' in line)
if '--caddy' in sys.argv:
    v = values()
    hashed = subprocess.check_output(['caddy', 'hash-password'], input=v['DASHBOARD_PASSWORD'].encode()).decode().strip()
    # caddy hash-password reads password from stdin.
    target = Path('/etc/caddy/uchu.env')
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text('\n'.join(f'{k}={os.environ[k]}' for k in ('DOMAIN', 'STUDIO_DOMAIN', 'EMAIL')) +
                      f'\nSTUDIO_USER={v["DASHBOARD_USERNAME"]}\nSTUDIO_HASH={hashed}\n')
    target.chmod(0o600)
else:
    updates = {
        'SITE_URL': os.environ['SITE_URL'],
        'API_EXTERNAL_URL': 'https://' + os.environ['DOMAIN'],
        'SUPABASE_PUBLIC_URL': 'https://' + os.environ['DOMAIN'],
        'ADDITIONAL_REDIRECT_URLS': os.environ['SITE_URL'] + '/**',
        'ENABLE_EMAIL_SIGNUP': 'false',  # Enable after SMTP delivery has been tested.
        'ENABLE_EMAIL_AUTOCONFIRM': 'false',
        'ENABLE_PHONE_SIGNUP': 'false',  # Enable only after SMS provider/hook test.
        'ENABLE_PHONE_AUTOCONFIRM': 'false',
        'DASHBOARD_USERNAME': 'admin',
    }
    for key, value in updates.items():
        if '\n' in value or '\r' in value or '"' in value or '$' in value:
            raise ValueError('Invalid configuration value')
        s, count = re.subn(r'^' + key + r'=.*$', lambda _: key + '=' + value, s, flags=re.M)
        if not count:
            s += f'\n{key}={value}\n'
    p.write_text(s)
    # Modify ONLY published ports, never internal POSTGRES_PORT values.
    compose = Path('docker-compose.yml')
    text = compose.read_text()
    text, count = re.subn(r'^(\s+- )((?:\$\{API_GW_HTTP_PORT[^\n]+|\$\{POSTGRES_PORT\}:5432|\$\{POOLER_PROXY_PORT_TRANSACTION\}:6543))$',
                          r'\g<1>127.0.0.1:\2', text, flags=re.M)
    if count != 3:
        raise RuntimeError('Upstream port layout changed; refusing to start')
    compose.write_text(text)
    Path('.uchu-initialized').touch()
