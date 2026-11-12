'use strict';
const assert=require('node:assert/strict');
const backend=require('../../proxy/accounts-backend.js');
(async()=>{
 const old={...process.env};
 try{
 Object.assign(process.env,{POCKETBASE_URL:'https://accounts.example.invalid',POCKETBASE_SERVICE_TOKEN:'fixture-'.repeat(8),SUPABASE_URL:'https://legacy.example.invalid',SUPABASE_SERVICE_KEY:'fixture-old',ACCOUNTS_BACKEND:'supabase'});
 const calls=[];let healthStatus=200,serviceStatus=200;
 const request=async(url,options)=>{calls.push({url,options});return url.endsWith('/health')?{statusCode:healthStatus,body:JSON.stringify({ok:true,provider:'pocketbase'})}:{statusCode:serviceStatus,body:JSON.stringify({users:0,private:'fixture-never-returned'})};};
 const info=await backend.probePocketbase(request,async r=>r.body);
 assert.deepEqual(info,{ok:true,provider:'pocketbase',health:true,serviceAuthenticated:true,users:0});
 assert.equal(backend.config().url,'https://legacy.example.invalid');
 assert.equal(calls[1].options.headers.apikey,process.env.POCKETBASE_SERVICE_TOKEN);assert.equal(calls[1].options.body,'{}');
 assert(calls.every(c=>c.url.startsWith('https://accounts.example.invalid/api/uchu/')));assert(!JSON.stringify(info).includes('fixture-'));
 healthStatus=503;await assert.rejects(()=>backend.probePocketbase(request,async r=>r.body));healthStatus=200;
 serviceStatus=403;await assert.rejects(()=>backend.probePocketbase(request,async r=>r.body));
 const {runBuffered}=require('../../proxy/proxy.js');
 process.env.ADMIN_TOKEN='fixture-admin';
 const denied=await runBuffered({method:'GET',url:'/admin/accounts-check',headers:{},body:''});assert.equal(denied.statusCode,403);
 const wrong=await runBuffered({method:'GET',url:'/admin/accounts-check',headers:{'X-Admin-Token':'wrong'},body:''});assert.equal(wrong.statusCode,403);
 console.log('PASS: read-only PocketBase preflight, legacy routing unchanged, redacted result, auth failures and admin gate. External requests mocked.');
 }finally{for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old);}
})().catch(e=>{console.error(e.message);process.exit(1)});
