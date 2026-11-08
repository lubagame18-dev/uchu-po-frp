"""Real PocketBase bootstrap test for the post-install proxy configuration."""
from pathlib import Path
import json,os,re,socket,subprocess,tempfile,time,unittest,urllib.request
ROOT=Path(__file__).resolve().parents[2]
KIT=ROOT/'deploy/pocketbase'
class ServerConfig(unittest.TestCase):
    def test_trusted_header_bootstrap(self):
        source=(KIT/'configure-server.sh').read_text()
        script=re.search(r"network\.pb\.js <<'JS'\n([\s\S]+?)\nJS",source).group(1)
        subprocess.run(['bash','-n',str(KIT/'configure-server.sh')],check=True)
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);hooks=folder/'hooks';hooks.mkdir();(hooks/'network.pb.js').write_text(script)
            (hooks/'probe.pb.js').write_text("routerAdd('GET','/api/ip-probe',(e)=>e.json(200,{ip:e.realIP()}));")
            with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
            log=open(folder/'server.log','w')
            proc=subprocess.Popen([str(ROOT/'work/pocketbase-docs/pocketbase'),'serve','--dir',str(folder/'data'),'--hooksDir',str(hooks),'--http','127.0.0.1:'+str(port)],env=dict(os.environ,UCHU_TRUST_PROXY='true'),stdout=log,stderr=log)
            try:
                url='http://127.0.0.1:'+str(port)+'/api/ip-probe'
                for _ in range(100):
                    try:
                        with urllib.request.urlopen(url,timeout=1) as r:self.assertEqual(json.load(r)['ip'],'127.0.0.1')
                        break
                    except OSError:time.sleep(.05)
                else:self.fail('PocketBase did not start')
                request=urllib.request.Request(url,headers={'X-Real-IP':'198.51.100.42','X-Forwarded-For':'203.0.113.99'})
                with urllib.request.urlopen(request,timeout=3) as r:self.assertEqual(json.load(r)['ip'],'198.51.100.42')
            finally:proc.terminate();proc.wait(timeout=10);log.close()
if __name__=='__main__':unittest.main(verbosity=2)
