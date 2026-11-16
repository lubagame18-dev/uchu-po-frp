'use strict';
// Real payment module with a fake payment provider and a real local PocketBase backend.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const PAY=require('../../proxy/payments.js'),backend=require('../../proxy/accounts-backend.js');
const {Readable}=require('node:stream');
const scenario=JSON.parse(fs.readFileSync(0,'utf8'));
const base=process.env.POCKETBASE_URL+'/api/uchu';
let providerStatus=200,payment=scenario.payment;
async function raw(url,opt={}){
 if(url.startsWith('https://api.yookassa.ru/v3/payments/'))return {statusCode:providerStatus,body:JSON.stringify(payment)};
 const r=await fetch(url,{method:opt.method||'GET',headers:opt.headers,body:opt.body});return {statusCode:r.status,body:await r.text()};
}
const request=backend.wrapRequest(raw),readAll=async r=>r.body;
(async()=>{
 const order=scenario.payment.metadata.order;
 assert.equal((await PAY.status({order_id:order},'',request,readAll)).status,401);
 assert.equal((await PAY.status({order_id:order},scenario.otherToken,request,readAll)).status,404);
 providerStatus=503;assert.equal((await PAY.status({order_id:order},scenario.token,request,readAll)).status,503);
 assert.equal((await PAY.ykNotify(JSON.stringify({object:{id:'fixture-provider'}}),request,readAll)).status,503);providerStatus=200;
 payment={...scenario.payment,metadata:{...scenario.payment.metadata,uid:'another-owner'}};assert.equal((await PAY.status({order_id:order},scenario.token,request,readAll)).status,409);
 payment={...scenario.payment,status:'pending',paid:false};assert.equal((await PAY.status({order_id:order,paid:true},scenario.token,request,readAll)).json.state,'pending');
 payment=scenario.payment;
 const settled=await PAY.status({order_id:order},scenario.token,request,readAll);assert.equal(settled.status,200);assert.equal(settled.json.state,'paid');
 const first=await PAY.ykNotify(JSON.stringify({object:{id:'fixture-provider'}}),request,readAll);
 const second=await PAY.ykNotify(JSON.stringify({object:{id:'fixture-provider'}}),request,readAll);
 assert.equal(first.status,200);assert.equal(second.status,200);
 const repeated=await PAY.status({order_id:order},scenario.token,request,readAll);assert.equal(repeated.json.state,'paid');
 const r=await fetch(base+'/rest/v1/profiles?id=eq.'+scenario.payment.metadata.uid,{headers:{apikey:process.env.POCKETBASE_SERVICE_TOKEN}});
 const row=(await r.json())[0];assert.equal(row.ai_left,scenario.expectedLessons);assert.equal(row.tokens_limit,scenario.expectedTokens);
 const invalid=await PAY.notify('order_id='+encodeURIComponent(order)+'&sum=100&payment_status=success',{sign:'wrong-signature'},request,readAll);assert.equal(invalid.status,400);
 const {runBuffered}=require('../../proxy/proxy.js'),original=PAY.ykNotify;PAY.ykNotify=async()=>({status:503,json:{error:'retry'}});
 try{const r=await runBuffered({method:'POST',url:'/pay/yk',headers:{},body:'{}'});assert.equal(r.statusCode,503);}finally{PAY.ykNotify=original;}
 const DS=require('../../proxy/deepseek-pool.js'),chat=DS.chat;
 await request(base+'/rest/v1/profiles?id=eq.'+scenario.payment.metadata.uid,{method:'PATCH',headers:{apikey:process.env.POCKETBASE_SERVICE_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({tokens_used:0,tokens_limit:20000})});
 DS.chat=async(body,request,readAll,slot,model)=>{assert.equal(model,'deepseek-flash');assert.equal(body.n,undefined);assert.equal(body.tools,undefined);assert.equal(body.model,'deepseek-flash');return {text:JSON.stringify({usage:{total_tokens:300},choices:[{message:{content:'fixture'}}]}),account:'fixture'};};
 try{
  const stale=await runBuffered({method:'POST',url:'/deepseek/v1/chat/completions',headers:{'x-user-token':scenario.token},body:JSON.stringify({messages:[{role:'user',content:'fixture'}]})});assert.equal(stale.statusCode,409);
  const r=await runBuffered({method:'POST',url:'/deepseek/v1/chat/completions',headers:{'x-user-token':scenario.token},body:JSON.stringify({usage_phase:'refine',model:'deepseek-v4-pro',messages:[{role:'user',content:'fixture'}],n:100,tools:[{type:'web_search'}]})});assert.equal(r.statusCode,200,r.body);
  const result=await fetch(base+'/rest/v1/profiles?id=eq.'+scenario.payment.metadata.uid,{headers:{apikey:process.env.POCKETBASE_SERVICE_TOKEN}});assert.equal((await result.json())[0].tokens_used,300);
  await request(base+'/rest/v1/profiles?id=eq.'+scenario.payment.metadata.uid,{method:'PATCH',headers:{apikey:process.env.POCKETBASE_SERVICE_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({ai_left:1,tokens_limit:300,creation_limit:120000,creation_used:0})});
  const lesson='creation-'+scenario.payment.metadata.kind;
  await request(base+'/rest/v1/lessons',{method:'POST',headers:{apikey:process.env.POCKETBASE_SERVICE_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({id:lesson,user_id:scenario.payment.metadata.uid,data:{docs:{}}})});
  const creation=await runBuffered({method:'POST',url:'/deepseek/v1/chat/completions',headers:{'x-user-token':scenario.token},body:JSON.stringify({messages:[{role:'user',content:'fixture'}],usage_phase:'creation',lesson_id:lesson})});assert.equal(creation.statusCode,200,creation.body);
  const after=await fetch(base+'/rest/v1/profiles?id=eq.'+scenario.payment.metadata.uid,{headers:{apikey:process.env.POCKETBASE_SERVICE_TOKEN}}),p=(await after.json())[0];assert.equal(p.tokens_used,300);assert.equal(p.ai_left,0);assert.equal(p.creation_used,300);
 }finally{DS.chat=chat;}
 console.log('PASS: owner-only status check credits once without webhook; single/legacy/pack; replay safe; failed webhook returns 503; pending/forged/foreign denied');
})().catch(e=>{console.error(e.stack);process.exit(1)});
