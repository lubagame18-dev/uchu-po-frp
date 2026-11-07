'use strict';
// Full existing site and callback page, real PocketBase; vendor redirects and deliveries are local fixtures.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fixture=JSON.parse(fs.readFileSync(0,'utf8')),root=path.resolve(__dirname,'../..'),origin='https://uchu-po-frp.ru';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:360,height:800}}),oldBackend=[];let oauthRequests=0;
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.hostname.endsWith('supabase.co')||(url.hostname==='functions.yandexcloud.net'&&String(url.searchParams.get('path')).startsWith('/auth/')))oldBackend.push(req.url());
   if(req.url().startsWith(fixture.base+'/api/')){
    const headers={...req.headers()};delete headers.host;
    const r=await fetch(req.url(),{method:req.method(),headers,body:['GET','HEAD'].includes(req.method())?undefined:req.postData()});
    return route.fulfill({status:r.status,body:await r.text(),headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'*'}});
   }
   if(url.origin==='https://oauth.yandex.ru'){
    oauthRequests++;assert.equal(url.searchParams.get('code_challenge_method'),'S256');
    const callback=origin+'/yandex.html?code=browser&state='+encodeURIComponent(url.searchParams.get('state'));
    return route.fulfill({contentType:'text/html',body:'<script>location.replace('+JSON.stringify(callback)+')</script>'});
   }
   if(url.origin===origin){
    const rel=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
    if(rel==='js/accounts-config.js')return route.fulfill({contentType:'application/javascript',body:'window.UCHU_ACCOUNTS='+JSON.stringify({provider:'pocketbase',url:fixture.base})+';'});
    const filename=path.resolve(root,rel);if(!filename.startsWith(root+path.sep))return route.abort();
    if(fs.existsSync(filename)&&fs.statSync(filename).isFile())return route.fulfill({contentType:{'.js':'application/javascript','.html':'text/html','.css':'text/css','.json':'application/json'}[path.extname(filename)]||'application/octet-stream',body:fs.readFileSync(filename)});
    return route.fulfill({status:404,body:''});
   }
   return route.abort();
  });
  await page.goto(origin+'/',{waitUntil:'load'});await page.waitForFunction(()=>window.Account);
  await page.evaluate(()=>Account.open());await page.locator('#acYandex').click();
  await page.waitForFunction(()=>window.Account?.session?.email==='browser-yandex@example.invalid');
  const yandexUid=await page.evaluate(()=>Account.session.uid);assert.equal(oauthRequests,1);assert.equal(new URL(page.url()).hash,'');assert(!page.url().includes('code='));
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('uchu:yandex-pkce')),null);
  await page.evaluate(async()=>{await Account.signOut();Account.open();});
  await page.locator('[data-via=phone]').click();await page.locator('#acPhone').fill('+79000000008');await page.locator('#acAgree').check();await page.locator('#acGo').click();
  await page.locator('#acCode').waitFor({state:'visible'});
  assert(await page.locator('#acResend').isDisabled());assert(await page.locator('#acPhone').getAttribute('readonly')!==null);
  const sms=await (await fetch(fixture.sink+'/last-sms')).json();assert.equal(sms.phone,'+79000000008');
  await page.locator('#acCode').fill(sms.code==='000000'?'111111':'000000');await page.locator('#acGo').click();await page.waitForFunction(()=>document.querySelector('#acMsg')?.textContent.includes('неверный'));assert(await page.locator('#acCode').isVisible());
  await page.locator('#acCode').fill(sms.code);await page.locator('#acGo').click();
  await page.waitForFunction(()=>window.Account?.session?.uid&&window.Account.session.email==='+79000000008');
  assert.notEqual(await page.evaluate(()=>Account.session.uid),yandexUid);assert.deepEqual(oldBackend,[]);
  // Reject callback state mismatch before any OAuth exchange or redirect.
  await page.goto(origin+'/yandex.html?code=unexpected&state=wrong',{waitUntil:'load'});
  assert((await page.locator('#m').textContent()).includes('устарела'));assert(!page.url().includes('code='));
  console.log('PASS: Yandex button → PKCE callback → account, SMS UI → separate account, state mismatch blocked; no old Supabase/proxy auth calls.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
