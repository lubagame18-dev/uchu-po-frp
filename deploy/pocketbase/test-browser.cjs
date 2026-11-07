'use strict';
// Executes the existing full site and export code with fixture accounts, local files and local PocketBase only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fixture=JSON.parse(fs.readFileSync(0,'utf8')),root=path.resolve(__dirname,'../..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[],oldBackend=[];page.on('pageerror',e=>errors.push(e.message));
 const origin='http://localhost:18766';
 let delayedToken=null,releaseDelay=null,startedDelay=null;
 let delayGate,delayStarted;
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.hostname.endsWith('supabase.co'))oldBackend.push(url.pathname);
  if(req.url().startsWith(fixture.base+'/api/')){
   if(delayedToken && req.method()==='GET' && url.pathname==='/api/uchu/rest/v1/lessons' && req.headers().authorization===delayedToken){startedDelay();await delayGate;}
   const headers={...req.headers()};delete headers.host;
   const r=await fetch(req.url(),{method:req.method(),headers,body:req.method()==='GET'||req.method()==='HEAD'?undefined:req.postData()});
   return route.fulfill({status:r.status,body:await r.text(),headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'*'}});
  }
  if(url.origin===origin){
   const rel=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
   if(rel==='js/accounts-config.js')return route.fulfill({contentType:'application/javascript',body:'window.UCHU_ACCOUNTS='+JSON.stringify({provider:'pocketbase',url:fixture.base})+';'});
   const filename=path.resolve(root,rel);if(!filename.startsWith(root+path.sep))return route.abort();
   if(fs.existsSync(filename)&&fs.statSync(filename).isFile()){
    const type={'.js':'application/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[path.extname(filename)]||'application/octet-stream';
    return route.fulfill({contentType:type,body:fs.readFileSync(filename)});
   }
   return route.fulfill({status:404,body:'Not found'});
  }
  if(url.pathname.endsWith('/html2pdf.bundle.min.js'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,'work/pocketbase-docs/html2pdf.bundle.min.js'))});
  return route.abort();
 });
 await page.goto(origin+'/',{waitUntil:'load'});
 await page.waitForFunction(()=>window.Account&&typeof mdToDocxBlob==='function');
 await page.evaluate(async()=>{
  await Store.put('lessons','foreign-draft-fixture',{id:'foreign-draft-fixture',updatedAt:new Date().toISOString(),docs:{lesson:'FOREIGN-OWNER'}});
  localStorage.setItem('uchu:previous-account',JSON.stringify({uid:'previous-fixture-owner',endpoint:'https://previous.example'}));
 });
 await page.evaluate(async x=>{await Account.signIn(x.email,x.password);},fixture);
 assert.equal(await page.evaluate(()=>Store.get('lessons','foreign-draft-fixture')),undefined);
 assert.equal(await page.evaluate(async()=>{const archive=(await AccountsBackend.archives()).find(x=>x?.owner==='previous-fixture-owner');return archive?.lessons[0]?.docs?.lesson;}),'FOREIGN-OWNER');
 assert.equal(await page.evaluate(()=>Account.session.uid),fixture.uid);
 await page.waitForTimeout(150);
 await page.evaluate(async()=>{
   const lesson={id:'browser-fixture',title:'Persistence fixture',updatedAt:new Date().toISOString(),params:{subject:'ru',grade:5},docs:{lesson:'# Persistence fixture\n\nSTORAGE-MARKER-789'}};
   await Store.put('lessons',lesson.id,lesson);await Account.push(true);
 });
 const saved=await page.evaluate(()=>Account.db('/rest/v1/lessons?id=eq.browser-fixture'));
 assert.equal(saved[0].data.docs.lesson.includes('STORAGE-MARKER-789'),true);
 await page.reload({waitUntil:'load'});await page.waitForFunction(()=>window.Account?.session?.uid);
 const restored=await page.evaluate(async()=>{await Account.pull();return Store.get('lessons','browser-fixture');});
 assert.equal(restored.docs.lesson.includes('STORAGE-MARKER-789'),true);
 const exports=await page.evaluate(async()=>{
  const L=await Store.get('lessons','browser-fixture');
  const docx=await mdToDocxBlob(L.docs.lesson,L.title),pdf=await docToPdfBlob(L,'lesson');
  const encode=b=>new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(b);});
  return {docx:await encode(docx),pdf:await encode(pdf)};
 });
 const out=path.join(root,'work/pocketbase-browser');fs.mkdirSync(out,{recursive:true});
 const docx=Buffer.from(exports.docx,'base64'),pdf=Buffer.from(exports.pdf,'base64');
 assert.equal(docx.subarray(0,2).toString(),'PK');assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert(docx.length>100);assert(pdf.length>100);
 fs.writeFileSync(path.join(out,'fixture.docx'),docx);fs.writeFileSync(path.join(out,'fixture.pdf'),pdf);
 await page.evaluate(()=>Account.remove('browser-fixture'));
 assert.deepEqual(await page.evaluate(()=>Account.db('/rest/v1/lessons?id=eq.browser-fixture')),[]);
 await page.evaluate(()=>Store.put('materials','owned-fixture',{id:'owned-fixture',text:'OWNED-MATERIAL'}));
 await page.evaluate(()=>Account.signOut());
 assert.equal(await page.evaluate(()=>Account.session),null);
 assert.equal(await page.evaluate(async()=>(await Store.all('lessons')).length),0);
 assert.equal(await page.evaluate(async()=>!!(await AccountsBackend.archives()).find(x=>x.owner==='previous-fixture-owner')),true);
 await page.evaluate(async x=>{await Account.signIn(x.email,x.password);},fixture);
 assert.equal(await page.evaluate(async()=>(await Store.get('materials','owned-fixture')).text),'OWNED-MATERIAL');
 await page.evaluate(async()=>{await Account.db('/rest/v1/lessons',{method:'POST',body:JSON.stringify({id:'late-owner-fixture',user_id:Account.session.uid,data:{id:'late-owner-fixture',updatedAt:new Date().toISOString(),docs:{lesson:'OWNER-A-PRIVATE'}}})});});
 delayedToken='Bearer '+await page.evaluate(()=>Account.session.access);
 delayGate=new Promise(r=>releaseDelay=r);delayStarted=new Promise(r=>startedDelay=r);
 const pending=page.evaluate(()=>Account.pull());await delayStarted;
 await page.evaluate(async x=>{await Account.signIn(x.otherEmail,x.password);},fixture);
 delayedToken=null;releaseDelay();await pending;
 assert.equal(await page.evaluate(()=>Account.session.uid),fixture.otherUid);
 assert.equal(await page.evaluate(async()=>!!await Store.get('lessons','late-owner-fixture')),false);
 assert.equal(await page.evaluate(async()=>!!await Store.get('materials','owned-fixture')),false);
 assert.deepEqual(oldBackend,[],'Browser contacted previous Supabase backend');
 if(errors.length)throw new Error('Browser errors: '+errors.join('; '));
 console.log('PASS: full existing site signs in, saves/pulls after reload, exports DOCX/PDF, deletes fixture; no old Supabase requests');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exit(1)});
