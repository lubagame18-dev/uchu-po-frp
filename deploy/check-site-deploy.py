"""Offline regression checks: python deploy/check-site-deploy.py (PyYAML required)."""
import fnmatch
import json
import os
from pathlib import Path
import subprocess
import tempfile
import yaml

ROOT = Path(__file__).resolve().parents[1]
workflow = yaml.safe_load((ROOT / '.github/workflows/deploy-yandex.yml').read_text())
steps = workflow['jobs']['deploy']['steps']
script = next(step['run'] for step in steps if 'aws s3 sync' in step.get('run', ''))
subprocess.run(['bash', '-n'], input=script, text=True, check=True)
with tempfile.TemporaryDirectory() as tmp:
    fake = Path(tmp) / 'aws'
    fake.write_text('#!/usr/bin/env python3\nimport json,os,sys\nwith open(os.environ["AWS_CALLS"], "a") as f: f.write(json.dumps(sys.argv[1:])+"\\n")\n')
    fake.chmod(0o755)
    calls = Path(tmp) / 'calls'
    env = dict(os.environ, PATH=tmp + os.pathsep + os.environ['PATH'],
               AWS_CALLS=str(calls), BUCKET='test-only', ENDPOINT='https://example.invalid')
    subprocess.run(['bash', '-e', '-c', script], cwd=ROOT, env=env, check=True)
    commands = [json.loads(line) for line in calls.read_text().splitlines()]
assert len(commands) == 3
sync = commands[0]
assert sync[:3] == ['s3', 'sync', '.']
assert '--size-only' not in sync
patterns = [sync[i + 1] for i, item in enumerate(sync) if item == '--exclude']
assert patterns == (ROOT / 'deploy/site-excludes.txt').read_text().splitlines()
excluded = lambda path: any(fnmatch.fnmatchcase(path, pattern) for pattern in patterns)
for path in ['knowledge-base/a.json', 'knowledge/frp/a.json', 'knowledge/a/b.html',
             'deploy/ru/private.json', 'tools/tg-poll.cjs', 'api/server.js',
             'proxy/index.js', '.env.production', 'presentation_database/render_all_russian.py']:
    assert excluded(path), path
for path in ['index.html', 'sw.js', 'js/app.js', 'css/style.css', 'frp_tasks/ru.json',
             'presentation_database/illustrated/grade-1/example.svg',
             'presentation_database/russian_all_lessons_1-11_svg.zip']:
    assert not excluded(path), path
for command, name in zip(commands[1:], ['sw.js', 'index.html']):
    assert command[:3] == ['s3', 'cp', name]
    assert command[command.index('--cache-control') + 1] == 'no-cache'
ps = (ROOT / 'deploy/local-deploy.ps1').read_text()
assert 'site-excludes.txt' in ps and '@exclusions' in ps
assert ps.count('if ($LASTEXITCODE -ne 0)') == 2
assets = (ROOT / '.assetsignore').read_text().splitlines()
assert all(path in assets for path in ['knowledge-base', 'knowledge', 'deploy', 'tools'])
for path in (ROOT / '.github/workflows').glob('*.yml'):
    yaml.safe_load(path.read_text(encoding='utf-8-sig'))
print('PASS: workflows parse; real deploy shell uses shared exclusions; private paths blocked; public assets retained; cache refresh retained.')
