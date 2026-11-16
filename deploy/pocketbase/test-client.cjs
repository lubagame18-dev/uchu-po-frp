'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
function load(accounts){
 const ctx={window:{UCHU_SITE:{accounts,cloud:{url:'https://old.example',anonKey:'public'}}},URL,console};vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.join(root,'js/accounts-backend.js'),'utf8'),ctx);ctx.AccountsBackend=ctx.window.AccountsBackend;return ctx;
}
let c=load({});assert.equal(c.AccountsBackend.config().url,'https://old.example');
c=load({provider:'pocketbase',url:'https://accounts.example'});assert.equal(c.AccountsBackend.config().url,'https://accounts.example/api/uchu');assert(c.AccountsBackend.ready());assert.equal(c.AccountsBackend.config().anonKey,'');
assert.equal(c.AccountsBackend.body('[{"id":"x"}]'),'{"rows":[{"id":"x"}]}');
c=load({provider:'pocketbase',url:''});assert.equal(c.AccountsBackend.ready(),false);assert.equal(c.AccountsBackend.config().url,'');
assert.throws(()=>load({provider:'pocketbase',url:'http://remote.example'}).AccountsBackend.config());
const adapter=require('../../proxy/accounts-backend.js');
const old={...process.env};
(async()=>{try{
 delete process.env.ACCOUNTS_BACKEND;
 let calls=[];const request=adapter.wrapRequest((url,opt)=>{calls.push([url,opt]);return Promise.resolve({statusCode:200})});
 await request('https://old.example/rest/v1/lessons',{});assert.equal(calls[0][0],'https://old.example/rest/v1/lessons');
 process.env.ACCOUNTS_BACKEND='pocketbase';process.env.SUPABASE_URL='https://old.example';process.env.SUPABASE_SERVICE_KEY='old-secret-fixture';process.env.POCKETBASE_URL='https://accounts.example';process.env.POCKETBASE_SERVICE_TOKEN='new-fixture-secret-0000000000000000000000000000';
 calls=[];await request('https://old.example/rest/v1/lessons',{headers:{apikey:process.env.SUPABASE_SERVICE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_KEY},body:'[]'});
 assert.equal(calls[0][0],'https://accounts.example/api/uchu/rest/v1/lessons');assert.equal(calls[0][1].headers.Authorization,undefined);assert.equal(calls[0][1].body,'{"rows":[]}');assert.equal(calls[0][1].headers.apikey,process.env.POCKETBASE_SERVICE_TOKEN);
 calls=[];await request('https://api.yookassa.ru/v3/payments',{headers:{Authorization:'Basic fixture'}});assert.equal(calls[0][0],'https://api.yookassa.ru/v3/payments');assert.equal(calls[0][1].headers.Authorization,'Basic fixture');
 delete process.env.POCKETBASE_URL;assert.throws(()=>adapter.config());
 calls=[];await request('https://api.deepseek.com/v1/chat/completions',{});assert.equal(calls[0][0],'https://api.deepseek.com/v1/chat/completions');
 console.log('PASS: provider opt-in, no old-backend fallback, private/public configuration separated, AI/payment destinations preserved');
}finally{for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];Object.assign(process.env,old);}})().catch(e=>{console.error(e);process.exit(1)});
