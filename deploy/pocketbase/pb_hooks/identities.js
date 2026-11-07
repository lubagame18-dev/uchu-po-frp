'use strict';
const u=require(__hooks+'/uchu.js'),provider=require(__hooks+'/identity-providers.js');
const fail=u.identityTools.fail, now=()=>Date.now();
const hash=text=>$security.hs256(text,$os.getenv('UCHU_SERVICE_TOKEN'));
function row(app,key) { const a=app.findRecordsByFilter('uchu_login_state','key = {:key}','',1,0,{key:key});return a.length?a[0]:null; }
function data(r) { return JSON.parse(r.getString('data')); }
function save(app,key,body,expires) { const r=row(app,key)||new Record(app.findCollectionByNameOrId('uchu_login_state'));r.set('key',key);r.set('data',body);r.set('expires',expires);app.save(r);return r; }
function userBy(app,field,value) { const a=app.findRecordsByFilter('uchu_users',field+' = {:value}','',1,0,{value:value});return a.length?a[0]:null; }
function phone(raw) { let s=String(raw||'').replace(/[^0-9]/g,'');if(s[0]==='8')s='7'+s.slice(1);if(!/^79[0-9]{9}$/.test(s)||s.startsWith('7940'))fail(400,'Use a Russian mobile phone number +79xxxxxxxxx');return '+'+s; }
function newUser(app,fields) {
  const r=new Record(app.findCollectionByNameOrId('uchu_users')),password=$security.randomString(64);
  r.set('password',password);r.set('passwordConfirm',password);r.set('verified',true);
  Object.keys(fields).forEach(k=>r.set(k,fields[k]));app.save(r);
  u.identityTools.write(app,'profiles',{id:r.id,email:r.getString('email'),plan:'free',ai_left:2,tokens_limit:80000,tokens_used:0},{service:true},'POST');return r;
}
function enabled(flag) { if($os.getenv(flag)!=='true'||$os.getenv('UCHU_SERVICE_TOKEN').length<32)fail(503,'This login method is not enabled on this server'); }
function limit(app,key,max,duration) {
  let r=row(app,key),b=r&&r.getFloat('expires')>now()?data(r):{n:0};
  if(b.n>=max)fail(429,'Too many login requests');b.n++;
  save(app,key,b,r&&r.getFloat('expires')>now()?r.getFloat('expires'):now()+duration);
}
function dailyMax() { const n=Number($os.getenv('SMS_DAILY_MAX')||30);if(!Number.isInteger(n)||n<1||n>300)fail(503,'Invalid SMS budget limit');return n; }
function monthlyMax() { const n=Number($os.getenv('SMS_MONTHLY_MAX')||20);if(!Number.isInteger(n)||n<1||n>3000)fail(503,'Invalid monthly SMS limit');return n; }
exports.otp=e=>u.identityTools.send(e,()=>{
  enabled('UCHU_ALLOW_SMS');if(!provider.smsConfigured())fail(503,'SMS delivery is not configured');
  const body=e.requestInfo().body,p=phone(body.phone),c=u.identityTools.context(e),owner=body.link===true?c.uid:'';
  if(body.link===true&&!owner)fail(401,'Sign in before linking a phone number');
  const key='sms:'+hash(p),id=$security.randomString(32);let code=$security.randomStringWithAlphabet(6,'0123456789');
  e.app.runInTransaction(app=>{
    const old=row(app,key);if(old&&data(old).sentAt>now()-60000)fail(429,'Too many login requests; wait 60 seconds');
    if(old){const previous=data(old);while($security.equal(previous.otp,hash(previous.id+':'+code)))code=$security.randomStringWithAlphabet(6,'0123456789');}
    limit(app,'sms-day:'+new Date().toISOString().slice(0,10),dailyMax(),172800000);
    limit(app,'sms-month:'+new Date().toISOString().slice(0,7),monthlyMax(),3024000000);
    limit(app,'sms-phone-day:'+hash(p)+':'+new Date().toISOString().slice(0,10),6,172800000);
    limit(app,'sms-ip:'+hash(e.realIP()),10,3600000);
    save(app,key,{id:id,otp:hash(id+':'+code),sentAt:now(),attempts:0,owner:owner,used:false},now()+300000);
  });
  try {provider.sendSms(p,code);} catch(_) {
    e.app.runInTransaction(app=>{const r=row(app,key);if(r&&data(r).id===id){const b=data(r);b.used=true;save(app,key,b,r.getFloat('expires'));}});
    fail(502,'SMS delivery failed; request a new code after 60 seconds');
  }
  return e.json(200,{expires_in:300,retry_after:60});
});
exports.verify=e=>u.identityTools.send(e,()=>{
  enabled('UCHU_ALLOW_SMS');const body=e.requestInfo().body,p=phone(body.phone),c=u.identityTools.context(e);
  if(body.type!=='sms'||!/^\d{6}$/.test(String(body.token||'')))fail(400,'Invalid or expired OTP');
  const key='sms:'+hash(p);let result,error;
  e.app.runInTransaction(app=>{
    const r=row(app,key),b=r&&data(r);
    if(!b||b.used||r.getFloat('expires')<=now()||b.attempts>=5){error=[400,'Invalid or expired OTP'];return;}
    if(b.owner&&b.owner!==c.uid){error=[401,'Sign in to the same account before linking'];return;}
    b.attempts++;
    if(!$security.equal(b.otp,hash(b.id+':'+String(body.token)))){save(app,key,b,r.getFloat('expires'));error=[400,'Invalid or expired OTP'];return;}
    b.used=true;save(app,key,b,r.getFloat('expires'));
    let record=userBy(app,'phone',p);
    if(b.owner){
      if(record&&record.id!==b.owner){error=[409,'Phone is already linked to another account'];return;}
      record=app.findRecordById('uchu_users',b.owner);
      if(record.getString('phone')&&record.getString('phone')!==p){error=[409,'Changing an existing linked phone requires account recovery review'];return;}
      record.set('phone',p);app.save(record);
    } else if(!record){
      if($os.getenv('UCHU_ALLOW_SMS_SIGNUP')!=='true'){error=[403,'Phone registration is not enabled'];return;}
      record=newUser(app,{phone:p});
    }
    if(!record.getBool('verified')){error=[403,'Account requires migration review'];return;}
    result=record;
  });
  if(error)fail(error[0],error[1]);return e.json(200,u.identityTools.session(result));
});
function challenge(verifier) {
  const hex=$security.sha256(verifier),bytes=hex.match(/../g).map(x=>parseInt(x,16)),chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';let out='';
  for(let i=0;i<bytes.length;i+=3){const n=(bytes[i]<<16)|((bytes[i+1]||0)<<8)|(bytes[i+2]||0);out+=chars[(n>>>18)&63]+chars[(n>>>12)&63];if(i+1<bytes.length)out+=chars[(n>>>6)&63];if(i+2<bytes.length)out+=chars[n&63];}return out;
}
function callback() { const origin=$os.getenv('UCHU_SITE_ORIGIN')||'https://uchu-po-frp.ru';if(!/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i.test(origin))fail(503,'Invalid site origin');return origin+'/yandex.html'; }
exports.yandexStart=e=>u.identityTools.send(e,()=>{
  enabled('UCHU_ALLOW_YANDEX');if(!provider.yandexConfigured())fail(503,'Yandex ID is not configured');
  const b=e.requestInfo().body,c=u.identityTools.context(e),owner=b.link===true?c.uid:'';
  if(b.link===true&&!owner)fail(401,'Sign in before linking Yandex ID');
  if(!/^[a-zA-Z0-9_-]{32,128}$/.test(String(b.state||''))||!/^[a-zA-Z0-9_-]{43}$/.test(String(b.code_challenge||'')))fail(400,'Invalid OAuth state or PKCE challenge');
  e.app.runInTransaction(app=>{
    const key='yandex:'+hash(b.state);if(row(app,key))fail(409,'OAuth state already used');
    limit(app,'yandex-ip:'+hash(e.realIP()),20,3600000);
    save(app,key,{challenge:b.code_challenge,owner:owner,used:false},now()+300000);
  });
  return e.json(200,{url:provider.yandexAuthorize(b.state,b.code_challenge,callback()),expires_in:300});
});
exports.yandexFinish=e=>u.identityTools.send(e,()=>{
  enabled('UCHU_ALLOW_YANDEX');if(!provider.yandexConfigured())fail(503,'Yandex ID is not configured');
  const b=e.requestInfo().body,c=u.identityTools.context(e);let login;
  if(!/^[a-zA-Z0-9_-]{32,128}$/.test(String(b.state||''))||!/^[a-zA-Z0-9._~-]{43,128}$/.test(String(b.code_verifier||''))||typeof b.code!=='string'||!b.code||b.code.length>2048)fail(400,'Invalid OAuth callback');
  e.app.runInTransaction(app=>{
    const key='yandex:'+hash(b.state),r=row(app,key);login=r&&data(r);
    if(!login||login.used||r.getFloat('expires')<=now()||!$security.equal(login.challenge,challenge(b.code_verifier)))fail(400,'Invalid or expired OAuth state');
    if(login.owner&&login.owner!==c.uid)fail(401,'Sign in to the same account before linking');
    login.used=true;save(app,key,login,r.getFloat('expires'));
  });
  let identity;try {identity=provider.yandexIdentity(b.code,b.code_verifier,callback());} catch(_){fail(502,'Yandex ID verification failed; start again');}
  let record;
  e.app.runInTransaction(app=>{
    record=userBy(app,'yandex_id',identity.id);
    if(login.owner){
      if(record&&record.id!==login.owner)fail(409,'Yandex ID is linked to another account');
      record=app.findRecordById('uchu_users',login.owner);
      if(record.getString('yandex_id')&&record.getString('yandex_id')!==identity.id)fail(409,'Changing a linked Yandex ID requires account recovery review');
      record.set('yandex_id',identity.id);app.save(record);
    } else if(!record){
      if($os.getenv('UCHU_ALLOW_YANDEX_SIGNUP')!=='true')fail(403,'Yandex registration is not enabled');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email))fail(400,'Yandex ID must provide an email address');
      if(userBy(app,'email',identity.email))fail(409,'Sign in by email, then link Yandex ID from your account');
      record=newUser(app,{email:identity.email,yandex_id:identity.id});
    }
    if(!record.getBool('verified'))fail(403,'Account requires migration review');
  });
  return e.json(200,u.identityTools.session(record));
});
