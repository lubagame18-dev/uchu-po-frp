'use strict';
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const env={SMS_PROVIDER:'smsru',SMS_API_ID:'fixture-api',YANDEX_CLIENT_ID:'fixture-id',YANDEX_CLIENT_SECRET:'fixture-secret'},calls=[];let replies=[];
const context={exports:{},$os:{getenv:key=>env[key]||''},$http:{send:r=>{calls.push(r);assert.equal(new URL(r.url).protocol,'https:');return replies.shift();}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'pb_hooks/identity-providers.js'),'utf8'),context);const p=context.exports;
assert(p.smsConfigured());replies=[{statusCode:200,json:{status:'OK',sms:{'79000000000':{status:'OK'}}}}];p.sendSms('+79000000000','123456');assert.equal(calls.at(-1).method,'POST');assert(!calls.at(-1).url.includes('fixture-api'));
replies=[{statusCode:200,json:{status:'OK'}}];assert.throws(()=>p.sendSms('+79000000000','123456'));
env.SMS_PROVIDER='smsc';env.SMS_LOGIN='fixture-login';env.SMS_PASSWORD='fixture-password';replies=[{statusCode:200,json:{id:1,cnt:1}}];p.sendSms('+79000000000','123456');assert.equal(calls.at(-1).url,'https://smsc.ru/sys/send.php');assert(!calls.at(-1).url.includes('fixture-password'));
env.SMS_PROVIDER='smspilot';assert.equal(p.smsConfigured(),false);env.SMSPILOT_API_KEY='F'.repeat(64);assert(p.smsConfigured());
replies=[{statusCode:200,json:{send:[{server_id:'123',phone:'79000000000',status:'0'}]}}];p.sendSms('+79000000000','123456');
const pilot=calls.at(-1),body=new URLSearchParams(pilot.body);assert.equal(pilot.url,'https://smspilot.ru/api.php');assert.equal(pilot.method,'POST');assert.equal(body.get('apikey'),env.SMSPILOT_API_KEY);assert.equal(body.get('ttl'),'5');assert(body.get('send').length<=70);assert.equal(body.has('from'),false);assert(!pilot.url.includes('apikey'));
for(const result of [{error:{code:111}},{send:[{server_id:'1',phone:'79000000000',status:'-2'}]},{send:[{server_id:'1',phone:'79000000001',status:'0'}]},{send:[]}]){replies=[{statusCode:200,json:result}];assert.throws(()=>p.sendSms('+79000000000','123456'));}
env.SMS_PROVIDER='unknown';assert.equal(p.smsConfigured(),false);assert.throws(()=>p.sendSms('+79000000000','123456'));
const authorize=new URL(p.yandexAuthorize('state','challenge','https://example.invalid/yandex.html'));assert.equal(authorize.origin,'https://oauth.yandex.ru');assert.equal(authorize.searchParams.get('code_challenge_method'),'S256');assert.equal(authorize.searchParams.get('scope'),'login:email login:info');
replies=[{statusCode:200,json:{access_token:'fixture-access'}},{statusCode:200,json:{id:'123',default_email:' Example@Example.Invalid '}}];const id=p.yandexIdentity('fixture-code','fixture-verifier','https://example.invalid/yandex.html');assert.equal(id.id,'123');assert.equal(id.email,'example@example.invalid');
const token=calls.at(-2);assert.equal(token.url,'https://oauth.yandex.ru/token');assert.equal(new URLSearchParams(token.body).get('code_verifier'),'fixture-verifier');assert(!token.url.includes('fixture-secret'));assert.equal(calls.at(-1).headers.Authorization,'OAuth fixture-access');
replies=[{statusCode:400,json:{error:'invalid_grant'}}];assert.throws(()=>p.yandexIdentity('bad','bad','https://example.invalid/yandex.html'));
assert(calls.every(c=>['sms.ru','smsc.ru','smspilot.ru','oauth.yandex.ru','login.yandex.ru'].includes(new URL(c.url).hostname)));
console.log('PASS: fixed HTTPS vendor endpoints; POST credentials, PKCE, SMS per-recipient status, provider failures. Network mocked.');
