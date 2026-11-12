'use strict';
(async()=>{
 const $=s=>document.querySelector(s),status=$('#status'),origin=location.origin;
 const tell=s=>{status.textContent=s;status.scrollIntoView({block:'nearest'});};
 let session;try{session=JSON.parse(sessionStorage.getItem('uchu:check:session'));}catch{}
 const query=new URLSearchParams(location.search),fragment=location.hash.slice(1),pathname=location.pathname;
 history.replaceState(null,'',pathname);
 async function api(path,body,method='POST'){
  const headers={'Content-Type':'application/json'};if(session?.access_token)headers.Authorization='Bearer '+session.access_token;
  const r=await fetch('/api/check/'+path,{method,headers,body:method==='GET'?undefined:JSON.stringify(body||{}),cache:'no-store'});
  const j=r.status===204?{}:await r.json();
  if(!r.ok){const hints={400:'Проверьте данные. Для входа сначала подтвердите почту.',401:'Нужно войти в тестовый кабинет.',409:'Эта почта или способ входа уже связаны с кабинетом. Войдите по почте, затем привяжите способ входа.',502:'Провайдер не подтвердил вход. Сообщите Codex.'};throw Error(hints[r.status]||'Запрос не прошёл: HTTP '+r.status);}
  return j;
 }
 function save(j){session=j;sessionStorage.setItem('uchu:check:session',JSON.stringify(j));render();}
 function render(){$('#account').textContent=session?.user?'Вошли в тестовый кабинет: '+session.user.email:'Вы ещё не вошли.';}
 function run(fn){return async e=>{e?.preventDefault();const b=e?.submitter||e?.currentTarget;if(b?.tagName==='BUTTON')b.disabled=true;try{await fn(e);}catch(err){tell(err.message);}finally{if(b?.tagName==='BUTTON')b.disabled=false;}};}
 try{
  if(pathname==='/check/'&&fragment){const r=await fetch('/check/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:fragment})});if(!r.ok)throw Error('Личная ссылка устарела. Сообщите Codex — повторно вводить ключи не нужно.');}
  const ready=await fetch('/check/status',{cache:'no-store'});if(!ready.ok)throw Error('Откройте последнюю личную ссылку проверки из сообщения Codex в этом же браузере.');
  $('main').hidden=false;render();tell('Проверка открыта. Начните с почты, затем проверьте Яндекс и Google.');
  if(pathname==='/check/verify'){if(!fragment)throw Error('Нет ссылки подтверждения. Откройте письмо заново.');await api('native/confirm-verification',{token:fragment});tell('Почта подтверждена. Теперь войдите по почте и тестовому паролю.');}
  if(pathname==='/check/reset'){$('#reset').hidden=false;$('#reset-form').onsubmit=run(async()=>{await api('native/confirm-password-reset',{token:fragment,password:$('#new-password').value,passwordConfirm:$('#new-password').value});$('#new-password').value='';$('#reset').hidden=true;session=null;sessionStorage.removeItem('uchu:check:session');render();tell('Тестовый пароль изменён. Теперь войдите с новым паролем.');});}
  if(pathname==='/google.html'||pathname==='/yandex.html'){
   const kind=pathname.slice(1,-5);let attempt;try{attempt=JSON.parse(sessionStorage.getItem('uchu:check:'+kind));}catch{}sessionStorage.removeItem('uchu:check:'+kind);
   if(query.get('error')||!query.get('code')||!attempt||attempt.state!==query.get('state')||Date.now()-attempt.at>300000)throw Error('Вход отменён или устарел. Вернитесь на страницу проверки и нажмите кнопку ещё раз.');
   const j=await api('auth/v1/'+kind+'_finish',{code:query.get('code'),state:attempt.state,code_verifier:attempt.verifier});save(j);tell((kind==='google'?'Google':'Яндекс')+': вход подтверждён. Можно вернуться к следующему шагу.');
  }
 }catch(e){tell(e.message);return;}
 $('#email-form').onsubmit=run(async e=>{const action=e.submitter.value,j=await api('auth/v1/'+(action==='signup'?'signup':'token?grant_type=password'),{email:$('#email').value,password:$('#password').value});$('#password').value='';if(action==='signup')tell('Тестовый кабинет создан. Откройте письмо подтверждения в этом же браузере.');else{save(j);tell('Вход по почте подтверждён.');}});
 for(const action of ['resend','recover'])$('#'+action).onclick=run(async()=>{if(!$('#email').reportValidity())return;await api('auth/v1/'+action,{email:$('#email').value});tell('Запрос принят. Проверьте входящие и спам на указанной почте.');});
 for(const b of document.querySelectorAll('[data-copy]'))b.onclick=run(async()=>{await navigator.clipboard.writeText(b.dataset.copy);tell('Адрес скопирован. Вставьте его в поле Redirect URI и сохраните.');});
 for(const b of document.querySelectorAll('[data-provider]'))b.onclick=run(async()=>{
  const kind=b.dataset.provider,bytes=crypto.getRandomValues(new Uint8Array(32)),encode=a=>btoa(String.fromCharCode(...a)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  const verifier=encode(bytes),state=encode(crypto.getRandomValues(new Uint8Array(32))),challenge=encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
  const j=await api('auth/v1/'+kind+'_start',{state,code_challenge:challenge,link:!!session});const u=new URL(j.url);if(u.protocol!=='https:'||u.hostname!==(kind==='google'?'accounts.google.com':'oauth.yandex.ru')||new URL(u.searchParams.get('redirect_uri')).origin!==origin)throw Error('Неверный адрес провайдера. Сообщите Codex.');
  sessionStorage.setItem('uchu:check:'+kind,JSON.stringify({state,verifier,at:Date.now()}));location.assign(u.href);
 });
 $('#logout').onclick=run(async()=>{session=null;sessionStorage.removeItem('uchu:check:session');render();tell('Вы вышли из тестового кабинета в этом браузере.');});
 $('#storage').onclick=run(async()=>{
  if(!session)throw Error('Сначала войдите.');const id='check-'+crypto.randomUUID(),body={id,title:'Проверка сохранения',data:{marker:'check-v1'}};let created=false;
  try{await api('rest/v1/lessons',body);created=true;let rows=await api('rest/v1/lessons?id=eq.'+id,null,'GET');if(rows.length!==1||rows[0].data.marker!=='check-v1')throw Error('Чтение записи не подтверждено.');await api('rest/v1/lessons?id=eq.'+id,{title:'Проверка изменения'},'PATCH');rows=await api('rest/v1/lessons?id=eq.'+id,null,'GET');if(rows[0]?.title!=='Проверка изменения')throw Error('Изменение не подтверждено.');}finally{if(created)await api('rest/v1/lessons?id=eq.'+id,{},'DELETE');}
  const rows=await api('rest/v1/lessons?id=eq.'+id,null,'GET');if(rows.length)throw Error('Удаление не подтверждено.');tell('Запись, чтение, изменение и удаление в тестовой базе прошли.');
 });
})();
