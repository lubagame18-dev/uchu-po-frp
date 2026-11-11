// Native browser download regression. Fixture bytes only; no VPS or real keys.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {spawnSync}=require('node:child_process'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
const python=spawnSync('python3',['-c',`
import importlib.util,http.client,json,threading
from pathlib import Path
from http.server import ThreadingHTTPServer
spec=importlib.util.spec_from_file_location('web','backup-key-web.py');web=importlib.util.module_from_spec(spec);spec.loader.exec_module(web)
state={'token':'fixture-token','expires':0,'used':False,'lock':threading.Lock()}
server=ThreadingHTTPServer(('127.0.0.1',0),web.recovery_handler(state,Path('/nonexistent-fixture.agekey')))
threading.Thread(target=server.serve_forever,daemon=True).start()
c=http.client.HTTPConnection('127.0.0.1',server.server_port);c.request('GET',web.PAGE,headers={'Host':'accounts.uchu-po-frp.ru'});r=c.getresponse()
print(json.dumps({'html':r.read().decode(),'headers':dict(r.getheaders())}));server.shutdown();server.server_close()
`],{cwd:__dirname,encoding:'utf8'});
assert.equal(python.status,0,python.stderr);const fixture=JSON.parse(python.stdout),html=fixture.html;
assert.equal(fixture.headers['Referrer-Policy'],'same-origin');
for(const policy of ['no-referrer',fixture.headers['Referrer-Policy']]){
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:360,height:780}});const page=await context.newPage();let sent;
 await page.route('https://accounts.uchu-po-frp.ru/**',async r=>{const q=r.request();if(q.method()==='POST'){
 sent={origin:q.headers().origin,body:q.postData()};return r.fulfill({status:200,headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="fixture.agekey"'},body:'FIXTURE ONLY'});
 }return r.fulfill({status:200,headers:{'Content-Type':'text/html','Referrer-Policy':policy,'Content-Security-Policy':fixture.headers['Content-Security-Policy']},body:html});});
 await page.goto('https://accounts.uchu-po-frp.ru/private-backup-setup/#fixture-token');
 assert.equal(new URL(page.url()).hash,'');assert.equal(await page.locator('#token').inputValue(),'fixture-token');
 const download=page.waitForEvent('download');await page.locator('#download').click();const d=await download;
 assert.equal(d.suggestedFilename(),'fixture.agekey');assert.equal(sent.body,'token=fixture-token');
 assert.equal(sent.origin,policy==='no-referrer'?'null':'https://accounts.uchu-po-frp.ru');
 console.log(JSON.stringify({policy,origin:sent.origin,native_download:true,mobile360:true}));await context.close();
}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
