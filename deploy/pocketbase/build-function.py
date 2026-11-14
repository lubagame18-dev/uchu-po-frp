"""Rebuild the Yandex function from reviewed proxy JS, without deploying or bundling secrets."""
import argparse
from pathlib import Path
import re
import subprocess
import tempfile
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT=Path(__file__).resolve().parents[2]

def build(output):
    files={p.name:p for p in (ROOT/'proxy').glob('*.js') if p.is_file()}
    for name,path in files.items():
        for dependency in re.findall(r'require\(["\x27]\./([^"\x27]+)["\x27]\)',path.read_text()):
            if dependency not in files:raise ValueError('Missing local dependency: '+dependency)
        subprocess.run(['node','--check',str(path)],check=True)
    if 'yandex-function.js' not in files or 'accounts-backend.js' not in files:raise ValueError('Function entrypoint/adapter missing')
    # Loading the packed entrypoint catches missing modules before the archive is replaced.
    with tempfile.TemporaryDirectory(prefix='uchu-function-check-') as temp:
        folder=Path(temp)
        for name,path in files.items():(folder/name).write_bytes(path.read_bytes())
        subprocess.run(['node','-e',"if(typeof require(process.argv[1]).handler!=='function')process.exit(1)",str(folder/'yandex-function.js')],check=True)
        archive=folder/'function.zip'
        with ZipFile(archive,'w',compression=ZIP_DEFLATED) as z:
            for name,path in sorted(files.items()):
                info=ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,path.read_bytes())
        output.parent.mkdir(parents=True,exist_ok=True)
        output.write_bytes(archive.read_bytes())
    print('Validated function archive: '+str(len(files))+' JS modules. No deployment or environment changes.')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,default=ROOT/'work/pocketbase-function.zip');args=p.parse_args();build(args.output)
