#!/usr/bin/env python3
"""Hidden OAuth secret entry on the VPS console. No secrets in arguments or output."""
import argparse
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import termios

PROVIDERS = {
    'yandex': ('YANDEX_CLIENT_ID', 'YANDEX_CLIENT_SECRET', r'[a-f0-9]{32}'),
    'google': ('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', r'[A-Za-z0-9_-]+\.apps\.googleusercontent\.com'),
}

def update_environment(path, updates):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o600:
        raise ValueError('Environment must be a private regular file owned by the current user')
    for key, value in updates.items():
        if key not in {item for pair in PROVIDERS.values() for item in pair[:2]}:
            raise ValueError('Unsupported configuration key')
        if not re.fullmatch(r'[A-Za-z0-9._~-]{16,512}', value):
            raise ValueError('Invalid value; nothing was saved')
    lines = path.read_text().splitlines()
    kept = [line for line in lines if line.split('=', 1)[0] not in updates]
    payload = '\n'.join(kept + [key+'='+value for key,value in updates.items()])+'\n'
    fd, name = tempfile.mkstemp(prefix='.oauth-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as f:
            os.fchmod(f.fileno(), 0o600)
            f.write(payload)
            f.flush()
            os.fsync(f.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def disable_echo():
    settings = termios.tcgetattr(sys.stdin.fileno())
    settings[3] &= ~termios.ECHO
    termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, settings)


def masked_input(prompt):
    """Read from a real terminal, showing only stars. Never use echoed fallback."""
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        raise OSError('A real terminal is required')
    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    settings = termios.tcgetattr(fd)
    settings[3] &= ~(termios.ECHO | termios.ICANON)
    settings[6][termios.VMIN] = 1
    settings[6][termios.VTIME] = 0
    value = []
    try:
        termios.tcsetattr(fd, termios.TCSAFLUSH, settings)
        print(prompt, end='', flush=True)
        while True:
            char = os.read(fd, 1)
            if not char or char == b'\x04':
                raise EOFError()
            if char in (b'\r', b'\n'):
                print(flush=True)
                return ''.join(value)
            if char in (b'\x7f', b'\x08'):
                if value:
                    value.pop()
                    print('\b \b', end='', flush=True)
            elif char == b'\x15':
                print('\b \b' * len(value), end='', flush=True)
                value.clear()
            elif 32 <= char[0] <= 126 and len(value) < 513:
                value.append(chr(char[0]))
                print('*', end='', flush=True)
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)


def collect_secret(path, provider, client_id):
    id_key, secret_key, _ = PROVIDERS[provider]
    print('\nUCHU PRIVATE SETUP: '+provider.upper(), flush=True)
    print('Input shows STARS only. Enter saves. Backspace deletes. Ctrl+U clears.', flush=True)
    while True:
        try:
            secret = masked_input(provider.upper()+' CLIENT SECRET (stars): ')
        except (KeyboardInterrupt, EOFError):
            print('\nInput cancelled. This form stays open; try again.', flush=True)
            continue
        if not re.fullmatch(r'[A-Za-z0-9._~-]{16,512}', secret):
            print('Empty or invalid input. Use English letters and copy Client Secret exactly. Try again.', flush=True)
            continue
        update_environment(path, {id_key: client_id, secret_key: secret})
        del secret
        print(provider.upper()+': saved privately. Login/signup flags were not changed.', flush=True)
        return


def park():
    """Keep accidental follow-up input out of the root shell."""
    disable_echo()
    print('CONSOLE INPUT CLOSED. Close this browser tab. Codex will check the service.', flush=True)
    while True:
        try:
            masked_input('CLOSED (nothing else will be saved): ')
        except (KeyboardInterrupt, EOFError):
            print('\nConsole stays locked. Close the browser tab.', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for provider in PROVIDERS:
        parser.add_argument('--'+provider+'-client-id', required=True)
    args = parser.parse_args()
    if os.geteuid() != 0 or not sys.stdin.isatty() or not sys.stdout.isatty():
        raise ValueError('Use the root terminal on the VPS; redirected input is refused')
    disable_echo()
    for provider, (_, _, pattern) in PROVIDERS.items():
        if not re.fullmatch(pattern, getattr(args, provider+'_client_id')):
            raise ValueError('Invalid public Client ID')
    path = Path('/etc/pocketbase/pocketbase.env')
    for provider in PROVIDERS:
        collect_secret(path, provider, getattr(args, provider+'_client_id'))
    subprocess.run(['systemctl','restart','pocketbase'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print('\nSAVED BOTH PROVIDERS. Service restarted. Do not paste anything else.', flush=True)
    print('Real OAuth login is NOT accepted yet; production website was not switched.', flush=True)

if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Values and exception messages are never printed.
        print('SETUP PAUSED. No supplied values were printed. Ask Codex to check it.', file=sys.stderr)
        if not sys.stdin.isatty() or not sys.stdout.isatty():
            sys.exit(1)
    except (KeyboardInterrupt, EOFError):
        print('SETUP PAUSED. Ask Codex to check it.', file=sys.stderr)
    park()
