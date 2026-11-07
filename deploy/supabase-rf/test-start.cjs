// Offline browser fixture: serves START through Playwright routing, no HTTP server or API.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
 const page=await browser.newPage({viewport:{width:1280,height:920}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const requests=[];page.on('request',r=>requests.push(r.url()));
 const origin='http://localhost:18765';
 await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin});
 await page.route('**/*',route=>route.request().url()===origin+'/' ? route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'START.html'),'utf8')}) : route.abort());
 await page.goto(origin+'/');
 assert.equal(await page.title(),'Перенос кабинета в РФ — пульт');
 assert.equal(await page.locator('#finish').isDisabled(),true);
 assert.equal(await page.locator('[data-step]').count(),9);
 await page.locator('[data-step="0"]').check();
 await page.locator('input[name=q0][value=yes]').check();
 await page.reload();
 assert.equal(await page.locator('[data-step="0"]').isChecked(),true);
 assert.equal(await page.locator('input[name=q0][value=yes]').isChecked(),true);
 for(let i=0;i<11;i++)await page.locator(`input[name=q${i}][value=yes]`).check();
 assert.equal(await page.locator('#finish').isDisabled(),true);
 await page.locator('input[name=q11][value=yes]').check();
 assert.equal(await page.locator('#finish').isEnabled(),true);
 await page.locator('#finish').click();
 await page.reload();assert.match(await page.locator('#feedback').textContent(),/12/);
 await page.locator('input[name=q3][value=no]').check();
 assert.equal(await page.locator('#finish').isDisabled(),true);
 // Copy button works or exposes the selected text for manual copy.
 await page.locator('[data-copy="message-0"]').click();
 await page.waitForFunction(()=>/Скопировано|Выделите/.test(document.querySelector('[data-copy="message-0"]').textContent));
 assert.match(await page.locator('[data-copy="message-0"]').textContent(),/Скопировано|Выделите/);
 await page.locator('[data-next="1"]').click();
 await page.setViewportSize({width:360,height:800});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);
 assert.ok(requests.every(u=>u===origin+'/'), 'Unexpected external request');
 const out=process.env.SCREENSHOT_DIR || path.join(__dirname,'../../work');fs.mkdirSync(out,{recursive:true});
 await page.evaluate(()=>{localStorage.clear();location.reload();});await page.waitForLoadState();
 await page.screenshot({path:path.join(out,'START-mobile.png'),fullPage:true});
 await page.setViewportSize({width:1280,height:920});await page.screenshot({path:path.join(out,'START-desktop.png'),fullPage:true});
 console.log('PASS: START renders, progress persists, all-12 gate, revocation, copy/next, 360px, zero external requests/errors; screenshots captured.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
