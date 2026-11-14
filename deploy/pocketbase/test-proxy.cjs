'use strict';
// Real payment module with a fake payment provider and a real local PocketBase backend.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const PAY=require('../../proxy/payments.js'),backend=require('../../proxy/accounts-backend.js');
const {Readable}=require('node:stream');
const scenario=JSON.parse(fs.readFileSync(0,'utf8'));
const base=process.env.POCKETBASE_URL+'/api/uchu';
async function raw(url,opt={}){
 if(url.startsWith('https://api.yookassa.ru/v3/payments/'))return {statusCode:200,body:JSON.stringify(scenario.payment)};
 const r=await fetch(url,{method:opt.method||'GET',headers:opt.headers,body:opt.body});return {statusCode:r.status,body:await r.text()};
}
const request=backend.wrapRequest(raw),readAll=async r=>r.body;
(async()=>{
 const order=scenario.payment.metadata.order;
 const first=await PAY.ykNotify(JSON.stringify({object:{id:'fixture-provider'}}),request,readAll);
 const second=await PAY.ykNotify(JSON.stringify({object:{id:'fixture-provider'}}),request,readAll);
 assert.equal(first.status,200);assert.equal(second.status,200);
 const r=await fetch(base+'/rest/v1/profiles?id=eq.'+scenario.payment.metadata.uid,{headers:{apikey:process.env.POCKETBASE_SERVICE_TOKEN}});
 const row=(await r.json())[0];assert.equal(row.ai_left,scenario.expectedLessons);assert.equal(row.tokens_limit,scenario.expectedTokens);
 const invalid=await PAY.notify('order_id='+encodeURIComponent(order)+'&sum=70&payment_status=success',{sign:'wrong-signature'},request,readAll);assert.equal(invalid.status,400);
 console.log('PASS: real Yandex payment module settles once in PocketBase; invalid Prodamus signature refused');
})().catch(e=>{console.error(e.message);process.exit(1)});
