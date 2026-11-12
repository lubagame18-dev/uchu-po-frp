// Browser fixtures only: no real accounts, mail, OAuth or payment requests.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
const context=await browser.newContext({viewport:{width:360,height:780}}),page=await context.newPage();let opened=false,lessons=[],outside=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
const session={access_token:'fixture-session-token',user:{id:'fixture-owner',email:'fixture@example.invalid'}};
await page.route('**/*',async route=>{const req=route.request(),u=new URL(req.url()),p=u.pathname;let body;try{body=JSON.parse(req.postData()||'{}');}catch{}
if(['oauth.yandex.ru','accounts.google.com'].includes(u.hostname))return route.fulfill({contentType:'text/html',body:'<p>Fixture provider</p>'});
if(u.origin!=='https://accounts.uchu-po-frp.ru'){outside++;return route.abort();}
const send=(j,status=200,headers={})=>route.fulfill({status,headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(j)});
if(p==='/check/open'){assert.equal(body.token,'fixture-cap');opened=true;return send({},200,{'Set-Cookie':'uchu_check=fixture-gate; Path=/; Secure; HttpOnly; SameSite=Lax'});}
if(p==='/check/status'){assert(opened);assert.match(req.headers().cookie||'',/uchu_check=fixture-gate/);return send({ok:true});}
if(p==='/check/app.js')return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(__dirname,'acceptance.js'))});
if(['/check/','/check/verify','/check/reset','/yandex.html','/google.html'].includes(p))return route.fulfill({headers:{'Content-Type':'text/html','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'"},body:fs.readFileSync(path.join(__dirname,'acceptance.html'))});
if(p==='/api/check/auth/v1/token')return send(session);
if(p.endsWith('_start')){assert.equal(body.link,true);assert.equal(body.code_challenge.length,43);const kind=p.includes('google')?'google':'yandex',url=new URL(kind==='google'?'https://accounts.google.com/o/oauth2/v2/auth':'https://oauth.yandex.ru/authorize');url.searchParams.set('redirect_uri',u.origin+'/'+kind+'.html');return send({url:url.href});}
if(p.endsWith('_finish')){assert.equal(body.code,'fixture-code');assert.equal(body.code_verifier.length,43);return send(session);}
if(p.includes('/native/'))return route.fulfill({status:204,body:''});
if(p==='/api/check/rest/v1/lessons'){if(req.method()==='POST')lessons.push(body);if(req.method()==='PATCH')lessons[0].title=body.title;if(req.method()==='DELETE')lessons=[];return send(lessons);}
if(p.startsWith('/api/check/auth/v1/'))return send({user:session.user});
return send({},404);
});
await page.goto('https://accounts.uchu-po-frp.ru/check/#fixture-cap');await page.waitForFunction(()=>!document.querySelector('main').hidden);assert.equal(new URL(page.url()).hash,'');
await page.locator('#email').fill('fixture@example.invalid');await page.locator('#password').fill('fixture-password');await page.locator('[value=signup]').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('кабинет создан'));
await page.locator('#password').fill('fixture-password');await page.locator('[value=login]').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Вход по почте подтверждён'));
await page.locator('#storage').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('удаление в тестовой базе прошли'));assert.equal(lessons.length,0);
for(const kind of ['yandex','google']){
 await page.locator('[data-provider='+kind+']').click();await page.waitForURL(kind==='yandex'?'https://oauth.yandex.ru/**':'https://accounts.google.com/**');
 const attempt=await context.storageState();assert(attempt.cookies.some(c=>c.name==='uchu_check'&&c.httpOnly));
 await page.goto('https://accounts.uchu-po-frp.ru/check/');const state=await page.evaluate(k=>JSON.parse(sessionStorage.getItem('uchu:check:'+k)).state,kind);
 await page.goto('https://accounts.uchu-po-frp.ru/'+kind+'.html?code=fixture-code&state='+state);await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('вход подтверждён'));assert.equal(new URL(page.url()).search,'');
}
await page.goto('https://accounts.uchu-po-frp.ru/check/verify#fixture-verification');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Почта подтверждена'));
await page.goto('https://accounts.uchu-po-frp.ru/check/reset#fixture-reset');await page.locator('#new-password').fill('fixture-new-password');await page.locator('#reset-form button').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('пароль изменён'));
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);assert.equal(outside,0);
fs.mkdirSync(path.resolve(__dirname,'../../work/pocketbase-acceptance'),{recursive:true});await page.screenshot({path:path.resolve(__dirname,'../../work/pocketbase-acceptance/mobile360.png'),fullPage:true});
console.log('PASS: private cookie, signup/login, PKCE callbacks, verification/reset, CRUD, 360px; fixtures only.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
