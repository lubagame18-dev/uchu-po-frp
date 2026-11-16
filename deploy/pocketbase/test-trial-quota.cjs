'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const f=JSON.parse(fs.readFileSync(0,'utf8'));
Object.assign(process.env,{ACCOUNTS_BACKEND:'pocketbase',POCKETBASE_URL:f.base,POCKETBASE_SERVICE_TOKEN:f.service,COMMERCIAL:'true'});
const adapter=require('../../proxy/accounts-backend.js');
const request=adapter.wrapRequest(async(url,opt={})=>{const r=await fetch(url,{method:opt.method||'GET',headers:opt.headers||{},body:opt.body});return{statusCode:r.status,text:()=>r.text()};});
(async()=>{const quota=require('../../proxy/quota.js'),result=await quota.check(f.token,request,r=>r.text());assert.equal(result.ok,f.allowed,'Quota must not silently replenish a zero trial; paid credits must remain usable');console.log('PASS: live PocketBase profile + real quota module, expected access='+f.allowed);})().catch(e=>{console.error(e.message);process.exit(1)});
