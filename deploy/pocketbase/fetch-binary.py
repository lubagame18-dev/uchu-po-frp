"""Fetch the pinned official Linux x64 release to work/, verify the release checksum."""
import hashlib
import io
from pathlib import Path
import urllib.request
import zipfile

VERSION='0.40.6'
ROOT=Path(__file__).resolve().parents[2]
BASE='https://github.com/pocketbase/pocketbase/releases/download/v'+VERSION+'/'
NAME='pocketbase_'+VERSION+'_linux_amd64.zip'
with urllib.request.urlopen(BASE+'checksums.txt',timeout=30) as r: sums=r.read().decode()
expected=next(line.split()[0] for line in sums.splitlines() if line.split()[-1].lstrip('*')==NAME)
with urllib.request.urlopen(BASE+NAME,timeout=60) as r: data=r.read()
assert hashlib.sha256(data).hexdigest()==expected,'Release checksum mismatch'
folder=ROOT/'work/pocketbase-docs';folder.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(io.BytesIO(data)) as z: content=z.read('pocketbase')
path=folder/'pocketbase';temporary=folder/'pocketbase.download';temporary.write_bytes(content);temporary.chmod(0o755);temporary.replace(path)
print('Verified PocketBase '+VERSION+' Linux x64 release; binary saved to work/pocketbase-docs/pocketbase')
