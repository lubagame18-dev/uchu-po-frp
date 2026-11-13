'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fixture=JSON.parse(fs.readFileSync(0,'utf8')),root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),origin='https://uchu-po-frp.ru',errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());
  if(req.url().startsWith(fixture.base+'/api/')){const headers={...req.headers()};delete headers.host;const r=await fetch(req.url(),{method:req.method(),headers,body:['GET','HEAD'].includes(req.method())?undefined:req.postData()});return route.fulfill({status:r.status,body:await r.text(),headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'*'}});}
  if(u.origin===origin){const rel=decodeURIComponent(u.pathname).replace(/^\//,'')||'index.html';if(rel==='js/accounts-config.js')return route.fulfill({contentType:'application/javascript',body:'window.UCHU_ACCOUNTS='+JSON.stringify({provider:'pocketbase',url:fixture.base})+';'});const file=path.resolve(root,rel);if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({contentType:{'.js':'application/javascript','.html':'text/html','.css':'text/css'}[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});}
  return route.abort();
 });
 await page.goto(origin+'/',{waitUntil:'load'});await page.waitForFunction(()=>window.Account&&window.Privacy);await page.evaluate(x=>Account.signIn(x.email,x.password),fixture);
 await page.evaluate(async()=>{await Store.put('lessons','privacy-ui-fixture',{id:'privacy-ui-fixture',title:'Privacy fixture',docs:{lesson:'# Local fixture\n\nPrivate content.'},updatedAt:new Date().toISOString()});await Store.put('images','privacy-blob',new Blob(['BINARY-FIXTURE'],{type:'application/octet-stream'}));await Account.push(true);Account.open();});
 await page.locator('#acSettings').click();await page.locator('#profileConsent').waitFor();assert.equal(await page.locator('#profileConsent').isChecked(),false);
 await page.locator('#profileConsent').check();await page.locator('#profileConsentSave').click();await page.locator('#privacyStatus').filter({hasText:'Выбор сохранён'}).waitFor();
 const exportEvent=page.waitForEvent('download');await page.locator('#privacyExport').click();const downloaded=await exportEvent;const data=JSON.parse(fs.readFileSync(await downloaded.path(),'utf8'));
 assert.equal(data.server.account.id,fixture.uid);assert.equal(data.local.images.find(r=>r.key==='privacy-blob').value.data_url,'data:application/octet-stream;base64,QklOQVJZLUZJWFRVUkU=');
 await page.locator('#privacyExport').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#profileConsentSave').disabled);
 await page.locator('#profileConsent').uncheck();await page.locator('#profileConsentSave').click();await page.locator('#privacyStatus').filter({hasText:'Согласие отозвано'}).waitFor();
 fs.mkdirSync(path.join(root,'work/privacy-browser'),{recursive:true});await page.locator('#toast').waitFor({state:'hidden',timeout:12000});await page.screenshot({path:path.join(root,'work/privacy-browser/settings-desktop.png')});await page.setViewportSize({width:360,height:800});assert(await page.locator('#privacyZip').evaluate(el=>el.scrollWidth<=el.clientWidth));await page.screenshot({path:path.join(root,'work/privacy-browser/settings-mobile.png')});
 await page.locator('#privacyDeleteStart').click();await page.locator('#privacyDeleteForm').waitFor({state:'visible'});
 let code;for(let i=0;i<200;i++){try{code=JSON.parse(fs.readFileSync(fixture.codeFile,'utf8')).code;}catch{}if(code)break;await new Promise(r=>setTimeout(r,50));}assert(code,'Local SMTP confirmation code missing');
 await page.locator('#privacyDeleteCode').fill(code);await page.locator('#privacyDeleteForm input[type=checkbox]').check();await page.locator('#privacyDeleteForm button[type=submit]').click();
 await page.waitForFunction(()=>Account.session===null&&!document.querySelector('#privacyDeleteForm'));assert.equal(await page.evaluate(async()=>(await Store.all('lessons')).length),0);assert.equal(await page.evaluate(async()=>(await Store.all('images')).length),0);assert.deepEqual(errors,[]);
 console.log('PASS: real browser settings, optional consent/revocation, lossless Blob export, email-confirmed deletion, local purge; desktop/mobile screenshots. SMTP and identity are isolated fixtures.');
}finally{await browser.close();}})().catch(e=>{console.error(e.message);process.exit(1)});
