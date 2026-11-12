/* Optional account transport. No hosting choice, no secrets, Supabase remains default. */
(() => {
  'use strict';
  function config() {
    const a = window.UCHU_ACCOUNTS || window.UCHU_SITE?.accounts || {};
    if (a.provider === 'pocketbase') {
      const origin = String(a.url || '').replace(/\/+$/, '');
      if (origin && !/^https:\/\//.test(origin) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) throw new Error('PocketBase requires HTTPS');
      return {provider: 'pocketbase', url: origin ? origin + '/api/uchu' : '', anonKey: '', dashboard: a.dashboard || '', ownerTesting: a.ownerTesting === true};
    }
    return a.url && a.anonKey ? a : (window.UCHU_SITE?.cloud || {});
  }
  function body(value) {
    if (config().provider !== 'pocketbase' || typeof value !== 'string') return value;
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? JSON.stringify({rows: parsed}) : value;
  }
  function archiveDb() {
    return new Promise((resolve,reject) => {
      const request=indexedDB.open('uchu-account-archives',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('archives');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(new Error('Не удалось открыть защищённый локальный архив.'));
      request.onblocked=()=>reject(new Error('Закройте другие вкладки для сохранения локального архива.'));
    });
  }
  async function archive(previous,lessons,stores = {}) {
    const db=await archiveDb(),key=Date.now()+':'+crypto.randomUUID();
    try {
      await new Promise((resolve,reject)=>{const tx=db.transaction('archives','readwrite');tx.objectStore('archives').put({owner:previous.uid,endpoint:previous.endpoint,createdAt:Date.now(),lessons,stores},key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
      const saved=await new Promise((resolve,reject)=>{const req=db.transaction('archives').objectStore('archives').get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
      if(!saved||saved.lessons.length!==lessons.length)throw new Error('Не удалось проверить локальный архив.');
      return key;
    } finally {db.close();}
  }
  async function archives() {
    const db=await archiveDb();
    try{return await new Promise((resolve,reject)=>{const req=db.transaction('archives').objectStore('archives').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
    finally{db.close();}
  }
  window.AccountsBackend = Object.freeze({config, body, archive, archives, ready: () => { const c = config(); return !!c.url && (c.provider === 'pocketbase' || !!c.anonKey); }});
})();
