'use strict';
(async()=>{
  const q=new URLSearchParams(location.search),code=q.get('code'),error=q.get('error'),state=q.get('state');
  // Remove authorization codes from the URL before requests, rendering or navigation.
  history.replaceState(null,'',location.pathname);
  const show=text=>{document.getElementById('m').textContent=text;};
  if(window.UCHU_ACCOUNTS?.provider!=='pocketbase') {
    // Existing Supabase path remains available until the reviewed cutover.
    let site=location.origin+'/';try{const u=new URL(state||site);if(u.origin===location.origin)site=u.href;}catch{}
    if(error){location.replace(site+'#error_description=yandex');return;}
    if(!code){show('Нет кода от Яндекса. Вернитесь на сайт и попробуйте снова.');return;}
    try {
      const r=await fetch('https://functions.yandexcloud.net/d4ek0q8grbhn7q5muf24?path=/auth/yandex&format=json&code='+encodeURIComponent(code)+'&site='+encodeURIComponent(site));
      const j=await r.json(),target=new URL(j.redirect||site);
      if(target.origin!==location.origin&&!target.hostname.endsWith('.supabase.co'))throw Error();
      location.replace(target.href);
    } catch {show('Не удалось войти через Яндекс. Вернитесь на сайт и повторите вход.');}
    return;
  }
  let attempt;try{attempt=JSON.parse(sessionStorage.getItem('uchu:yandex-pkce'));}catch{}
  sessionStorage.removeItem('uchu:yandex-pkce');
  const endpoint=window.AccountsBackend?.config().url;
  if(error||!code||!attempt||attempt.state!==state||Date.now()-attempt.at>300000||attempt.endpoint!==endpoint){show('Вход отменён или ссылка устарела. Вернитесь на сайт и снова нажмите «Войти через Яндекс».');return;}
  const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),20000);
  try {
    const headers={'Content-Type':'application/json'};
    if(attempt.owner){const current=JSON.parse(localStorage.getItem('uchu:account'));if(current?.uid!==attempt.owner||current.endpoint!==endpoint)throw new Error('Сначала войдите в исходный кабинет.');headers.Authorization='Bearer '+current.access;}
    const r=await fetch(endpoint+'/auth/v1/yandex_finish',{method:'POST',headers,signal:ctl.signal,body:JSON.stringify({code,state,code_verifier:attempt.verifier})});
    const j=await r.json();
    if(!r.ok||!j.access_token)throw new Error(r.status===409?'Эта почта или Яндекс ID уже связаны с кабинетом. Войдите прежним способом и нажмите «Привязать Яндекс ID» в профиле.':'Не удалось подтвердить Яндекс ID. Повторите вход.');
    // Session stays within this tab, never in a URL or referrer.
    sessionStorage.setItem('uchu:yandex-pending',JSON.stringify({...j,endpoint,at:Date.now()}));location.replace('/');
  } catch(e){show(e.name==='AbortError'?'Сервер долго не отвечает. Повторите вход.':e.message);} finally {clearTimeout(timeout);}
})();
