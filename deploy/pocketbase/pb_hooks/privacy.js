'use strict';
const VERSION='2026-11-13', u=()=>require(__hooks+'/uchu.js'), DAY=86400000;
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
function rows(app,name,owner){return app.findRecordsByFilter('uchu_'+name,owner===undefined?'':'owner = {:owner}','',10001,0,{owner:owner||''});}
function data(r){return JSON.parse(r.getString('payload'));}
function get(app,name,key){const r=app.findRecordsByFilter('uchu_'+name,'key = {:key}','',1,0,{key});return r[0]||null;}
function put(app,name,key,owner,payload){const r=get(app,name,key)||new Record(app.findCollectionByNameOrId('uchu_'+name));r.set('key',key);r.set('owner',owner);r.set('payload',payload);r.set('recorded_at',payload.at||payload.recorded_at||payload.deleted_at||new Date().toISOString());r.set('kind',payload.kind||'');app.save(r);return r;}
function normalizedEmail(raw){let e=String(raw||'').trim().toLowerCase();const parts=e.split('@');if(parts.length===2&&['gmail.com','googlemail.com'].includes(parts[1]))e=parts[0].split('+')[0].replace(/\./g,'')+'@gmail.com';return e;}
function threeYearsFrom(time){const d=new Date(time);d.setUTCFullYear(d.getUTCFullYear()+3);return d.getTime();}
function digest(text){const key=$os.getenv('UCHU_PRIVACY_HMAC_KEY')||$os.getenv('UCHU_SERVICE_TOKEN');if(key.length<32)fail(503,'Privacy protection key is not configured');return $security.hs256(text,key);}
function identities(user){const keys=[];const e=normalizedEmail(user.getString('email'));if(e)keys.push('email:'+e);for(const field of ['google_id','yandex_id','phone']){const v=user.getString(field);if(v)keys.push(field+':'+v);}return keys.map(digest);}
exports.claimTrial=(app,user)=>{
  const keys=identities(user),now=Date.now();let eligible=true;
  for(const key of keys){const r=get(app,'trial_claims',key);if(r&&(!data(r).expires||data(r).expires>now)&&r.getString('owner')!==user.id)eligible=false;}
  for(const key of keys){const r=get(app,'trial_claims',key);if(!r||r.getString('owner')===user.id||(data(r).expires&&data(r).expires<=now))put(app,'trial_claims',key,user.id,{recorded_at:new Date().toISOString(),expires:0});}
  return eligible;
};
exports.acceptance=body=>{
  const a=body.legal;if(!a||a.offer!==true||a.offer_version!==VERSION||a.policy_version!==VERSION)fail(400,'Примите действующую оферту и ознакомьтесь с политикой обработки данных.');
  if(a.profile_consent===true&&a.consent_version!==VERSION)fail(400,'Подтвердите действующее согласие на данные профиля.');
  return {offer:true,offer_version:VERSION,policy_version:VERSION,profile_consent:a.profile_consent===true,consent_version:VERSION};
};
function event(app,owner,kind,details){const recent=app.findRecordsByFilter('uchu_privacy_events','owner = {:owner}','-recorded_at',1,0,{owner})[0];const previous=recent?(Date.parse(data(recent).at)||0):0;return put(app,'privacy_events',$security.randomString(32),owner,{kind,version:VERSION,at:new Date(Math.max(Date.now(),previous+1)).toISOString(),details:Object.assign({documents:require(__hooks+'/privacy-documents.js')},details||{})});}
exports.recordAcceptance=(app,owner,a,method)=>{event(app,owner,'terms',{method,offer_version:a.offer_version,policy_version:a.policy_version});if(a.profile_consent)event(app,owner,'profile_consent',{accepted:true});};
function profileEvent(app,owner){return app.findRecordsByFilter('uchu_privacy_events','owner = {:owner} && kind = "profile_consent"','-recorded_at',1,0,{owner})[0]||null;}
function profileAllowed(app,owner){const row=profileEvent(app,owner);return !!row&&data(row).details.accepted===true;}
exports.validateProfile=(app,owner,row)=>{if(['name','school','city','avatar'].some(k=>!!row[k])&&!profileAllowed(app,owner))fail(403,'Для необязательных данных профиля сначала включите отдельное согласие в настройках кабинета.');};
function auth(e){const c=u().identityTools.context(e);if(!c.user)fail(401,'Войдите в личный кабинет.');return c;}
function exportData(app,user){
  const tables={};for(const name of ['profiles','user_info','lessons','quizzes','quiz_questions','quiz_results','shared_materials','base_materials','bot_links','payments']){
    const all=rows(app,name,user.id);if(all.length>10000)fail(503,'Для большой выгрузки обратитесь к оператору.');tables[name]=all.map(data);
  }
  const events=rows(app,'privacy_events',user.id);if(events.length>10000)fail(503,'Для большой выгрузки истории обратитесь к оператору.');tables.privacy_events=events.map(data);
  return {exported_at:new Date().toISOString(),trial_protection:identities(user).map(key=>get(app,'trial_claims',key)).filter(Boolean).map(data),account:{id:user.id,email:user.getString('email'),phone:user.getString('phone'),google_id:user.getString('google_id'),yandex_id:user.getString('yandex_id')},tables};
}
exports.exportData=exportData;
exports.handle=e=>u().identityTools.send(e,()=>{
  e.response.header().set('Cache-Control','private, no-store');
  const action=e.request.pathValue('action'),body=e.requestInfo().body;
  if(e.request.method!==(['status','export'].includes(action)?'GET':'POST'))fail(405,'Неподдерживаемый метод.');
  if(action==='status'){const c=u().identityTools.context(e);return e.json(200,{version:VERSION,profile_consent:!!c.user&&profileAllowed(e.app,c.uid)});}
  const c=auth(e);
  if(action==='export')return e.json(200,exportData(e.app,c.user));
  if(action==='profile-consent'){
    if(typeof body.accepted!=='boolean'||body.version!==VERSION)fail(400,'Проверьте выбор и версию согласия.');
    e.app.runInTransaction(app=>{
      app.nonconcurrentDB().newQuery('PRAGMA secure_delete = ON').execute();
      const last=profileEvent(app,c.uid);
      if(body.accepted&&!profileAllowed(app,c.uid)){const recent=app.findRecordsByFilter('uchu_privacy_events','owner = {:owner} && kind = \"profile_consent\" && recorded_at >= {:cutoff}','',50,0,{owner:c.uid,cutoff:new Date(Date.now()-DAY).toISOString()});if(recent.filter(r=>data(r).details.accepted).length>=20)fail(429,'Слишком много изменений согласия. Отзыв остаётся доступен.');}
      if(!last||data(last).details.accepted!==body.accepted)event(app,c.uid,'profile_consent',{accepted:body.accepted});
      if(!body.accepted){const r=get(app,'user_info',c.uid);if(r)app.delete(r);}
    });return e.json(200,{profile_consent:body.accepted});
  }
  if(action==='delete-start'){
    const email=c.user.getString('email');if(!email||!c.user.getBool('verified'))fail(403,'Для удаления подтвердите почту или обратитесь к оператору.');
    const key='delete:'+c.uid,old=e.app.findRecordsByFilter('uchu_login_state','key = {:key}','',1,0,{key})[0];
    if(old&&JSON.parse(old.getString('data')).sentAt>Date.now()-60000)fail(429,'Подождите минуту перед повторной отправкой.');
    const history=rows(e.app,'privacy_events',c.uid).map(data).filter(x=>x.kind==='delete_mail'&&Date.parse(x.at)>Date.now()-DAY);if(history.length>=5)fail(429,'Лимит писем удаления: попробуйте завтра или напишите оператору.');
    event(e.app,c.uid,'delete_mail',{});
    const code=$security.randomStringWithAlphabet(8,'0123456789'),state={hash:digest(c.uid+':'+code),sentAt:Date.now(),attempts:0,used:false};
    const r=old||new Record(e.app.findCollectionByNameOrId('uchu_login_state'));r.set('key',key);r.set('expires',Date.now()+600000);r.set('data',state);e.app.save(r);
    const meta=e.app.settings().meta;
    try{e.app.newMailClient().send(new MailerMessage({from:{address:meta.senderAddress,name:meta.senderName},to:[{address:email}],subject:'Учу по ФРП — подтверждение удаления кабинета',html:'<p>Код подтверждения удаления кабинета: <strong>'+code+'</strong>.</p><p>Действует 10 минут. Введите его только в настройках на uchu-po-frp.ru. Если вы не запрашивали удаление, ничего не подтверждайте.</p>'}));}
    catch(_){state.used=true;r.set('data',state);e.app.save(r);fail(502,'Не удалось отправить код. Попробуйте позже или напишите оператору.');}
    return e.json(200,{sent:true,expires_in:600});
  }
  if(action==='delete-confirm'){
    if(body.expected_uid&&body.expected_uid!==c.uid)fail(409,'Кабинет изменился. Повторите удаление из нужной учётной записи.');
    if(!/^\d{8}$/.test(String(body.code||'')))fail(400,'Введите восьмизначный код из письма.');let error=null;
    e.app.runInTransaction(app=>{
      app.nonconcurrentDB().newQuery('PRAGMA secure_delete = ON').execute();
      const r=app.findRecordsByFilter('uchu_login_state','key = {:key}','',1,0,{key:'delete:'+c.uid})[0],s=r&&JSON.parse(r.getString('data'));
      if(!s||s.used||r.getFloat('expires')<=Date.now()||s.attempts>=5){error='Код истёк. Запросите новый.';return;}
      s.attempts++;r.set('data',s);app.save(r);
      if(!$security.equal(s.hash,digest(c.uid+':'+body.code))){error='Неверный код.';return;}
      if(rows(app,'payments',c.uid).some(r=>data(r).status==='created'))fail(409,'Есть незавершённый платёж. Для сверки и удаления напишите оператору: gladyshevalu14@mail.ru. Рабочие данные пока не удалялись.');
      exports.claimTrial(app,c.user);
      for(const key of identities(c.user)){const claim=get(app,'trial_claims',key);if(claim&&claim.getString('owner')===c.uid)put(app,'trial_claims',key,'',{recorded_at:new Date().toISOString(),expires:threeYearsFrom(Date.now())});}
      // Keep minimal payment/acceptance evidence for accounting and claims; never expose it to a new account.
      for(const r of rows(app,'free_usage'))if(data(r).key==='u:'+c.uid)app.delete(r);
      for(const name of ['lessons','profiles','user_info','quizzes','quiz_questions','quiz_results','shared_materials','base_materials','bot_links'])for(const row of rows(app,name,c.uid))app.delete(row);
      for(const row of app.findRecordsByFilter('uchu_site_admins','key = {:email}','',100,0,{email:c.user.getString('email').toLowerCase()}))app.delete(row);
      for(const row of app.findRecordsByFilter('uchu_login_state','key = {:key}','',10,0,{key:'delete:'+c.uid}))app.delete(row);
      put(app,'deletions',c.uid,'',{deleted_at:new Date().toISOString()});
      app.delete(app.findRecordById('uchu_users',c.uid));
    });if(error)fail(400,error);let backupQueued=true;try{$os.writeFile(e.app.dataDir()+'/.privacy-backup-needed',String(Date.now())+':'+c.uid,0o600);}catch(_){backupQueued=false;}return e.json(200,{deleted:true,backup_queued:backupQueued,retained:['minimal_payment_and_acceptance_evidence','trial_hmac_up_to_3_years','restricted_rotating_backups']});
  }
  fail(404,'Неизвестное действие.');
});

exports.cleanup=app=>{
  const now=Date.now();
  for(const r of rows(app,'trial_claims'))if(data(r).expires&&data(r).expires<now)app.delete(r);
  for(const r of rows(app,'privacy_events')){const deletion=get(app,'deletions',r.getString('owner'));if(deletion&&threeYearsFrom(Date.parse(data(deletion).deleted_at))<now)app.delete(r);}
  const month=new Date();month.setUTCMonth(month.getUTCMonth()-2);const cutoff=month.toISOString().slice(0,7);
  for(const r of rows(app,'free_usage'))if(String(data(r).month||'')<cutoff)app.delete(r);
  for(const r of rows(app,'payments')){const p=data(r),created=new Date(p.created_at||'');if(get(app,'deletions',r.getString('owner'))&&!p.legal_hold&&Number.isFinite(created.getTime())&&Date.UTC(created.getUTCFullYear()+6,0,1)<now)app.delete(r);}
  for(const r of rows(app,'deletions'))if(threeYearsFrom(Date.parse(data(r).deleted_at))<now&&!rows(app,'privacy_events',r.getString('key')).length&&!rows(app,'payments',r.getString('key')).length)app.delete(r);
};
