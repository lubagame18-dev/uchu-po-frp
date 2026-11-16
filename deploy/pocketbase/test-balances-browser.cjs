'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),f=JSON.parse(fs.readFileSync(0,'utf8')),root=path.resolve(__dirname,'../..'),origin='http://localhost:18766';
Object.assign(process.env,{ACCOUNTS_BACKEND:'pocketbase',POCKETBASE_URL:f.base,POCKETBASE_SERVICE_TOKEN:f.service,YOOKASSA_SHOP_ID:'fixture',YOOKASSA_KEY:'fixture'});
const PAY=require('../../proxy/payments.js'),backend=require('../../proxy/accounts-backend.js');let providerPayment=null;
const paymentRequest=backend.wrapRequest(async(url,opt={})=>{if(url.startsWith('https://api.yookassa.ru/'))return {statusCode:200,body:JSON.stringify(providerPayment)};const r=await fetch(url,{method:opt.method||'GET',headers:opt.headers,body:opt.body});return {statusCode:r.status,body:await r.text()};});
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
 const errors=[];let hold=true,release;const gate=new Promise(r=>release=r);
 async function context(){const c=await browser.newContext();await c.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());
  if(u.hostname==='functions.yandexcloud.net'&&u.searchParams.get('path')==='/pay/status'){
   const r=await PAY.status(JSON.parse(req.postData()||'{}'),req.headers()['x-user-token'],paymentRequest,async x=>x.body);return route.fulfill({status:r.status,contentType:'application/json',body:JSON.stringify(r.json)});
  }
  if(req.url().startsWith(f.base+'/api/')){
   if(hold&&req.method()==='GET'&&u.pathname.endsWith('/profiles'))await gate;
   const headers={...req.headers()};delete headers.host;
   const r=await fetch(req.url(),{method:req.method(),headers,body:['GET','HEAD'].includes(req.method())?undefined:req.postData()});return route.fulfill({status:r.status,body:await r.text(),headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'*'}});
  }
  if(u.origin===origin){const rel=decodeURIComponent(u.pathname).replace(/^\//,'')||'index.html';if(rel==='js/accounts-config.js')return route.fulfill({contentType:'application/javascript',body:'window.UCHU_ACCOUNTS='+JSON.stringify({provider:'pocketbase',url:f.base})+';'});const file=path.resolve(root,rel);if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({contentType:{'.js':'application/javascript','.html':'text/html','.css':'text/css','.json':'application/json'}[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});}
  return route.abort();});const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/',{waitUntil:'load'});await p.waitForFunction(()=>window.Account&&window.Access);return p;}
 async function api(route,body,service=true,method='POST'){
  const r=await fetch(f.base+'/api/uchu'+route,{method,headers:{'Content-Type':'application/json',...(service?{apikey:f.service}:{Authorization:'Bearer '+f.token})},body:body===undefined?undefined:JSON.stringify(body)});const j=await r.json();assert(r.ok,JSON.stringify(j));return j;}
 async function profile(plan,left,limit,used,capacity){return api('/rest/v1/profiles',{id:f.uid,plan,ai_left:left,ai_limit:capacity,tokens_limit:limit,tokens_used:used,paid_until:'2027-12-31T00:00:00Z'});}
 async function refresh(p){await p.evaluate(()=>Account.refreshPlan());await p.waitForFunction(()=>Account.session.profileState==='ready');}
 async function lesson(p,id){await p.evaluate(async id=>{await Store.put('lessons',id,{id,title:'Counter fixture',docs:{lesson:'# Counter fixture'},updatedAt:new Date().toISOString()});await Access.countLesson(id);},id);}
 async function tiles(p){return p.locator('.quota-meter').evaluateAll(xs=>xs.map(x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));}
 const a=await context();await a.evaluate(x=>Account.signIn(x.email,x.password),f);await a.locator('#lessonBadge .quota-value').filter({hasText:'Загрузка'}).waitFor();assert.equal(await a.locator('#lessonBadge [role=progressbar]').getAttribute('aria-valuenow'),null);hold=false;release();await refresh(a);
 assert.equal(await a.locator('#lessonBadge .quota-value').innerText(),'3');assert.equal(await a.locator('#lessonBadge [role=progressbar]').getAttribute('aria-valuemax'),'3');
 assert.equal(await a.evaluate(()=>{const s=JSON.parse(localStorage.getItem('uchu:account'));return ['aiLeft','aiLimit','tokens','paidUntil'].some(k=>k in s);}),false);
 await lesson(a,'browser-charge-1');assert.equal(await a.locator('#lessonBadge .quota-value').innerText(),'2');assert.equal(await a.locator('#lessonBadge [role=progressbar]').getAttribute('aria-valuenow'),'2');
 const b=await context();await b.evaluate(x=>Account.signIn(x.email,x.password),f);await refresh(b);assert.equal(await b.locator('#lessonBadge .quota-value').innerText(),'2');
 await b.evaluate(()=>localStorage.setItem('uchu:access',JSON.stringify({used:999,singleUsed:999,trialUsed:999})));await b.reload();await b.waitForFunction(()=>Account.session?.profileState==='ready');assert.equal(await b.locator('#lessonBadge .quota-value').innerText(),'2');
 await lesson(b,'browser-charge-2');await a.evaluate(()=>window.dispatchEvent(new Event('focus')));await a.locator('#lessonBadge .quota-value').filter({hasText:'1'}).waitFor();
 await api('/rest/v1/rpc/spend_ai',{p_id:f.uid,p_tok:true,p_tokens:50000});await a.evaluate(()=>window.dispatchEvent(new Event('uchu:usage')));await a.locator('#tokBadge .quota-value').filter({hasText:'20'}).waitFor();assert.equal(await a.locator('#lessonBadge .quota-value').innerText(),'1');
 await profile('ai',50,2700000,2470000,50);await refresh(a);assert.equal(await a.locator('#lessonBadge .quota-value').innerText(),'50');assert.equal((await a.locator('#tokBadge .quota-value').innerText()).replace(/\s/g,''),'25,5/300');
 await a.mouse.move(0,850);assert.equal(await a.locator('#lessonBadgeLabel').isVisible(),false);
 await a.locator('#lessonBadge .quota-meter').hover();assert.equal(await a.locator('#lessonBadgeLabel').isVisible(),true);
 await a.mouse.move(0,850);await a.locator('#tokBadge .quota-meter').focus();assert.equal(await a.locator('#tokBadgeLabel').isVisible(),true);await a.locator('#tokBadge .quota-meter').blur();
 fs.mkdirSync(path.join(root,'work/balances-browser'),{recursive:true});
 for(const width of [320,360,768,1024,1440]){
  await a.setViewportSize({width,height:900});assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Page overflow at '+width);
  const boxes=await a.locator('#lessonBadge,#tokBadge,#btnPlan,.nav button').evaluateAll(xs=>xs.filter(x=>!x.hidden).map(x=>{const r=x.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const x=boxes[i],y=boxes[j];assert(!(Math.min(x.right,y.right)-Math.max(x.x,y.x)>1&&Math.min(x.bottom,y.bottom)-Math.max(x.y,y.y)>1),'Overlapping header controls at '+width);}
  assert((await a.locator('#tokBadge').boundingBox()).y<900);if([360,1440].includes(width))await a.screenshot({path:path.join(root,'work/balances-browser/header-'+width+'.png')});
  assert(await a.locator('.quota-meter').evaluateAll(xs=>xs.every(x=>{const value=x.querySelector('.quota-value').getBoundingClientRect(),box=x.getBoundingClientRect();return value.left>=box.left&&value.right<=box.right&&value.top>=box.top&&value.bottom<=box.bottom;})),'Counter text outside battery at '+width);
  assert.equal(await a.locator('.hero .wrap > #quotaCounters').count(),1);assert.equal(await a.locator('.topbar #quotaCounters').count(),0);
  const [one,two]=await tiles(a);assert.equal(one.width,two.width);assert.equal(one.height,two.height);
  if(width<=600){assert.equal(one.y,two.y);assert(two.x>one.x);}else{assert.equal(one.x,two.x);assert(two.y>one.y);}
  assert(await a.locator('.quota-meter').evaluateAll(xs=>xs.every(x=>getComputedStyle(x,'::after').content==='none'&&getComputedStyle(x).animationName==='none')));
  await a.evaluate(()=>Access.paint());assert.deepEqual(await tiles(a),[one,two],'Repaint must keep tile positions');
  await a.mouse.move(one.x+one.width/2,one.y+one.height/2);await a.mouse.down();await a.mouse.move(one.x+one.width/2+18,one.y+one.height/2+18);await a.mouse.up();assert.deepEqual(await tiles(a),[one,two],'Tiles must not drag with the decorative shapes');
 }
 const beforeCharge=await tiles(a);await lesson(a,'browser-subscription-charge');assert.equal(await a.locator('#lessonBadge .quota-value').innerText(),'49');assert.deepEqual(await tiles(a),beforeCharge,'Balance update must not move the tiles');
 await profile('aiYear',50,2700000,0,50);await refresh(a);assert.equal(await a.locator('#lessonBadge .quota-value').innerText(),'50');
 await profile('ai',0,2700000,0,50);await refresh(a);assert.equal(await a.locator('#lessonBadge [role=progressbar]').getAttribute('aria-valuenow'),'0');assert.equal(await a.locator('.quota-buy').count(),0);await a.locator('#lessonBadge .quota-action').click();await a.locator('.tr-dlg').waitFor();assert(!(await a.locator('.tr-dlg').innerText()).includes('Пробный'));await a.evaluate(()=>closeModal());
 for(const [used,color] of [[80,'medium'],[95,'low'],[0,'high']]){await profile('single',3,100,used,3);await refresh(a);assert(await a.locator('#tokBadge .quota-meter').evaluate((x,c)=>x.classList.contains(c),color));}
 await api('/rest/v1/profiles',{id:f.uid,plan:'single',ai_left:null,ai_limit:null,tokens_limit:null,tokens_used:null});await refresh(a);assert.equal(await a.locator('#lessonBadge .quota-value').innerText(),'—');assert.equal(await a.locator('#tokBadge .quota-value').innerText(),'—');assert.equal(await a.locator('#tokBadge [role=progressbar]').getAttribute('aria-valuenow'),null);
 await api('/rest/v1/profiles',{id:f.uid,plan:'none',ai_left:0,ai_limit:0,tokens_limit:0,tokens_used:0});await refresh(a);await a.evaluate(()=>Account.open());await a.locator('#acPlans').click();assert((await a.locator('.tr-dlg').innerText()).includes('30 ₽'));assert(!(await a.locator('.tr-dlg').innerText()).includes('разово'));assert(!(await a.locator('.tr-dlg').innerText()).includes('Пробный'));
 await a.evaluate(()=>closeModal());
 const order='browser-instant-paid';await api('/rest/v1/payments',{order_id:order,user_id:f.uid,kind:'single_1',amount:30,status:'created',provider_id:'browser-payment'});
 providerPayment={id:'browser-payment',status:'succeeded',paid:true,amount:{value:'30.00',currency:'RUB'},metadata:{order,uid:f.uid,kind:'single_1'}};
 await a.evaluate(order=>{history.replaceState(null,'','/?pay=ok&order='+order);document.dispatchEvent(new Event('uchu:ready'));},order);
 await a.waitForFunction(()=>Account.session.aiLeft===1);assert.equal(await a.locator('#tokBadge .quota-value').innerText(),'10 / 10');assert.equal(await a.locator('.quota-action').count(),0);
 await a.evaluate(()=>Access.checkPayment('browser-instant-paid'));assert.equal(await a.locator('#lessonBadge .quota-value').innerText(),'1');
 assert.deepEqual(errors,[]);console.log('PASS: real PocketBase values; two-device sync; unchanged balances; equal stationary hero tiles; desktop column/mobile row; no upsell; 320–1440px and ARIA.');
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exit(1)});
