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
   if(['https://oauth.yandex.ru','https://accounts.google.com'].includes(url.origin)){
    oauthRequests++;assert.equal(url.searchParams.get('code_challenge_method'),'S256');
    const kind=url.hostname==='accounts.google.com'?'google':'yandex';
    const callback=origin+'/'+kind+'.html?code=browser&state='+encodeURIComponent(url.searchParams.get('state'));
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
  await page.evaluate(()=>Account.open());assert.equal(await page.locator('[data-via=phone]').count(),0);assert.equal(await page.locator('#acConsentL').isHidden(),true);await page.locator('[data-mode=up]').click();await page.locator('#acAgree').check();await page.locator('#acYandex').click();
  await page.waitForFunction(()=>window.Account?.session?.email==='browser-yandex@example.invalid');
  const yandexUid=await page.evaluate(()=>Account.session.uid);assert.equal(oauthRequests,1);assert.equal(new URL(page.url()).hash,'');assert(!page.url().includes('code='));
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('uchu:yandex-pkce')),null);
  await page.evaluate(async()=>{await Account.signOut();Account.open();});
  await page.locator('[data-mode=up]').click();await page.locator('#acAgree').check();await page.locator('#acGoogle').click();
  await page.waitForFunction(()=>window.Account?.session?.email==='browser-google@example.invalid');
  assert.notEqual(await page.evaluate(()=>Account.session.uid),yandexUid);assert.deepEqual(oldBackend,[]);assert.equal(oauthRequests,2);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('uchu:google-pkce')),null);
  await page.evaluate(async()=>{await Account.signOut();Account.open();});assert.equal(await page.locator('#acConsentL').isHidden(),true);await page.locator('#acGoogle').click();await page.waitForFunction(()=>window.Account?.session?.email==='browser-google@example.invalid');assert.equal(await page.locator('#privacyChoice').count(),0);
  await page.evaluate(()=>Account.open());await page.locator('#acLinkGoogle').waitFor();assert.equal(await page.locator('#acLinkPhone').count(),0);
  // Reject callback state mismatch before any OAuth exchange or redirect.
  await page.goto(origin+'/yandex.html?code=unexpected&state=wrong',{waitUntil:'load'});
  assert((await page.locator('#m').textContent()).includes('устарела'));assert(!page.url().includes('code='));
  await page.goto(origin+'/',{waitUntil:'load'});await page.waitForFunction(()=>window.Account);
  await page.evaluate(async()=>{await Account.signOut();window.UCHU_ACCOUNTS=null;window.UCHU_SITE.accounts=null;Account.open();});
  const legacyRequest=page.waitForRequest(req=>req.url().includes('/auth/v1/authorize?provider=google'));
  await page.locator('#acGoogle').click();assert((await legacyRequest).url().includes('.supabase.co/'),'Legacy Google still uses original backend');
  console.log('PASS: Yandex button → PKCE callback → account, Google UI → separate account, state mismatch blocked; no old Supabase/proxy auth calls.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
