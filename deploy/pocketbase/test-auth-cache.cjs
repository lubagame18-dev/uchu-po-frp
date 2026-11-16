const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const handlers={},calls=[];
const ctx={self:{addEventListener:(kind,fn)=>handlers[kind]=fn},URL,location:{origin:'https://site.example'},fetch:(req,opt)=>{calls.push({req,opt});return Promise.resolve({ok:true})},caches:{open:()=>{throw Error('Authentication must not enter caches')}},setTimeout};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../../sw.js'),'utf8'),ctx);
for(const path of ['/google.html?code=fixture-code','/yandex.html?code=fixture-code','/accounts-confirm.html?token=fixture-token','/js/accounts-config.js','/api/uchu/auth/v1/user']){
 let result;handlers.fetch({request:{url:ctx.location.origin+path,method:'GET'},respondWith:p=>result=p});assert(result);assert.equal(calls.at(-1).opt.cache,'no-store');
}
console.log('PASS: callback codes, confirmation links and account config bypass the service-worker cache.');
