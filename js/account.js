/* ===================================================================
   «Учу по ФРП» — личный кабинет.
   Вход по почте и паролю (пароль — любой, от 6 знаков, без требований к символам).
   Вход запоминается на устройстве. Уроки хранятся в облаке (Supabase) и не пропадают
   при очистке браузера; на любом устройстве после входа появляются все уроки.
   Облако подключает владелец сайта: UCHU_SITE.cloud = { url, anonKey }.
   Таблица в облаке (SQL — в ЛИЧНЫЙ_КАБИНЕТ_И_ОПЛАТА.md):
     lessons(id text, user_id uuid, data jsonb, updated_at timestamptz), доступ — только к своим строкам.
   =================================================================== */
const Account = (() => {
  "use strict";
  const KEY = "uchu:account";
  const C = () => window.UCHU_SITE?.cloud || {};
  const ready = () => !!(C().url && C().anonKey);
  let S = null; try { S = JSON.parse(localStorage.getItem(KEY)) || null; } catch { }
  const save = () => { try { S ? localStorage.setItem(KEY, JSON.stringify(S)) : localStorage.removeItem(KEY); } catch { } paint(); window.Access?.paint?.(); };
  const api = (path, opt = {}) => api0(path, opt).catch(e => { if (e.name === "AbortError") { const x = new Error("Сервер долго не отвечает. Проверьте интернет и попробуйте ещё раз."); x.status = 0; throw x; } if (e instanceof TypeError) { const x = new Error("Нет связи с сервером. Проверьте интернет или VPN и попробуйте ещё раз."); x.status = 0; throw x; } throw e; });
  const api0 = async (path, opt = {}) => {
    // без ответа сервера дольше 20 с — понятная ошибка, а не вечное «Вхожу…»
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), opt.timeout || 20000);
    const r = await fetch(C().url.replace(/\/+$/, "") + path, { signal: ctl.signal, ...opt, headers: { apikey: C().anonKey, "Content-Type": "application/json", ...(S?.access ? { Authorization: "Bearer " + S.access } : {}), ...(opt.headers || {}) } });
    clearTimeout(to);
    const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { }
    if (!r.ok) { const e = new Error(j?.msg || j?.error_description || j?.message || j?.error || ("HTTP " + r.status)); e.status = r.status; throw e; }
    return j;
  };
  const RU0 = m => /invalid login|invalid_grant|credentials/i.test(m) ? "Неверная почта или пароль." : /already registered|exists/i.test(m) ? "Эта почта уже зарегистрирована — войдите." : /password.*(6|short)/i.test(m) ? "Пароль — не короче 6 знаков." : /email.*(invalid|valid)/i.test(m) ? "Проверьте адрес почты." : /confirm/i.test(m) ? "Подтвердите почту по ссылке из письма (или владелец может отключить подтверждение)." : m;
  const RU = m => /rate limit|too many/i.test(m) ? "Слишком много писем за короткое время. Если вы уже нажимали ссылку в письме — просто войдите. Иначе попробуйте через час." : /not confirmed/i.test(m) ? "Почта ещё не подтверждена: откройте письмо и нажмите ссылку." : RU0(m);
  /* Вход по ссылке из письма: Supabase возвращает на сайт с #access_token=…&refresh_token=… */
  async function afterOAuth() {
    if (!S || !S.email) return;
    try {
      const k = "uchu:onb:" + S.email;
      if (localStorage.getItem(k)) return;
      localStorage.setItem(k, "1");
      try { await resendConfirm(S.email); } catch { }
      toast("Вход выполнен. Заполните имя и фото в профиле — они появятся в шапке сайта.", 9000);
      open();
    } catch { }
  }

  async function fromLink() {
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (h.get("error_description")) { history.replaceState(null, "", location.pathname + location.search); toast("Ссылка из письма устарела или уже использована. Просто войдите с почтой и паролем.", 8000); return; }
    const at = h.get("access_token"), rt = h.get("refresh_token"); if (!at || !rt || !ready()) return;
    history.replaceState(null, "", location.pathname + location.search);
    try {
      const u = await api("/auth/v1/user", { headers: { Authorization: "Bearer " + at } });
      setSession({ access_token: at, refresh_token: rt, expires_in: +h.get("expires_in") || 3600, user: u }, u.email);
      if (h.get("type") === "recovery") { newPasswordDialog(); await pull().catch(() => null); return; }
      toast("Почта подтверждена — вы вошли в личный кабинет.", 6000);
      await pull().catch(() => null); await plan().catch(() => null); loadInfo().catch(() => null);
      let want = null; try { want = localStorage.getItem("uchu:want-buy"); localStorage.removeItem("uchu:want-buy"); } catch { }
      if (want && window.Access) Access.checkout(want);
    } catch (e) { toast("Не удалось войти по ссылке: " + RU(e.message) + " Войдите с почтой и паролем.", 8000); }
  }
  function setSession(j, email) { S = { email: j.user?.email || email, uid: j.user?.id, access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000, pic: j.user?.user_metadata?.avatar_url || j.user?.user_metadata?.picture || "" }; save(); try { paint(); } catch { } try { paintNav(); } catch { } try { document.dispatchEvent(new Event("uchu:auth")); } catch { } }
  /* Пока облако не подключено — учётная запись в этом браузере (почта + отпечаток пароля); уроки — тоже здесь */
  const LKEY = "uchu:local-users";
  const lusers = () => { try { return JSON.parse(localStorage.getItem(LKEY)) || {}; } catch { return {}; } };
  async function phash(e, p) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("uchu-user:" + e.toLowerCase() + ":" + p)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
  async function localUp(email, password) { const u = lusers(), e = email.toLowerCase(); if (u[e]) throw new Error("already registered"); u[e] = { h: await phash(e, password), at: new Date().toISOString() }; localStorage.setItem(LKEY, JSON.stringify(u)); S = { email: e, local: true }; save(); return "ok"; }
  async function localIn(email, password) { const u = lusers()[email.toLowerCase()]; if (!u || u.h !== await phash(email, password)) throw new Error("Invalid login credentials"); S = { email: email.toLowerCase(), local: true }; save(); }
  async function signIn(email, password) { if (!ready()) return localIn(email, password); setSession(await api("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) }), email); pull().catch(e => console.warn("sync", e)); } // уроки подтягиваются фоном — вход не ждёт синхронизации
  // одноразовые почтовые ящики — не принимаем (защита бесплатного тарифа от многократных регистраций)
  const TEMP = /@(mailinator|guerrillamail|guerrillamailblock|sharklasers|10minutemail|10minemail|tempmail|temp-mail|tempmailo|tempr|tmpmail|tmpeml|yopmail|throwawaymail|trashmail|getnada|nada|dispostable|fakeinbox|maildrop|mintemail|mohmal|emailondeck|moakt|mail\.tm|mailnesia|burnermail|spamgourmet|dropmail|1secmail|minuteinbox|inboxkitten|tempail|luxusmail|emailfake|fakemail|crazymailing|mytemp|tempinbox|mailcatch|discard|33mail|harakirimail|getairmail|byom|vusra|wuuvo)\./i;
  async function signUp(email, password) {
    if (TEMP.test(email)) throw new Error("Одноразовые почтовые ящики не подходят — укажите свою постоянную почту.");
    if (!ready()) return localUp(email, password);
    // ссылка из письма должна вести обратно на сайт (а не на корень github.io)
    const back = location.origin + location.pathname;
    const j = await api("/auth/v1/signup?redirect_to=" + encodeURIComponent(back), { method: "POST", body: JSON.stringify({ email, password }) });
    if (j.access_token) { setSession(j, email); push(true).catch(() => null); return "ok"; }
    return "confirm"; // в проекте включено подтверждение почты
  }
  /* Забыли пароль: Supabase шлёт письмо со ссылкой, ссылка возвращает на сайт, там человек задаёт новый пароль */
  async function resendConfirm(email) { await api("/auth/v1/resend?redirect_to=" + encodeURIComponent(location.origin + location.pathname), { method: "POST", body: JSON.stringify({ type: "signup", email }) }); }
  async function recover(email) {
    if (!ready()) throw new Error("Восстановление работает, когда подключено облако.");
    await api("/auth/v1/recover?redirect_to=" + encodeURIComponent(location.origin + location.pathname), { method: "POST", body: JSON.stringify({ email }) });
  }
  function newPasswordDialog() {
    const m = openModal(`<div class="dialog narrow"><div class="dlg-h"><h2>Новый пароль</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div>
      <form class="dlg-b" id="acNew" autocomplete="off"><p class="small">Придумайте новый пароль для ${esc(S?.email || "кабинета")}.</p>
        <div class="field"><label for="acNp">Новый пароль</label><input type="password" id="acNp" autocomplete="new-password" minlength="6" required></div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn flame" type="submit">Сохранить пароль</button><span class="small" id="acNm" role="status"></span></div></form></div>`);
    m.querySelector("#acNew").onsubmit = async e => {
      e.preventDefault(); const p = m.querySelector("#acNp").value, msg = m.querySelector("#acNm");
      if (p.length < 6) { msg.textContent = "Пароль — не короче 6 знаков."; return; }
      msg.textContent = "Сохраняю…";
      try { await api("/auth/v1/user", { method: "PUT", body: JSON.stringify({ password: p }) }); closeModal(); toast("Пароль изменён. Вы вошли в кабинет.", 6000); window.Access?.paint(); }
      catch (er) { msg.textContent = /same|different/i.test(er.message) ? "Новый пароль должен отличаться от старого." : "Не получилось: " + RU(er.message); }
    };
  }
  /* Вход по номеру телефона: Supabase шлёт SMS-код (через нашу функцию), человек вводит его — кабинет создаётся сам */
  const normPhone = v => { let d = String(v || "").replace(/\D/g, ""); if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1); if (d.length === 10) d = "7" + d; return /^7\d{10}$/.test(d) ? "+" + d : ""; };
  async function phoneCode(phone) { if (!ready()) throw new Error("Вход по телефону доступен, когда подключено облако."); await api("/auth/v1/otp", { method: "POST", body: JSON.stringify({ phone, create_user: true }) }); }
  async function phoneVerify(phone, token) { const j = await api("/auth/v1/verify", { method: "POST", body: JSON.stringify({ type: "sms", phone, token: String(token).trim() }) }); if (!j.access_token) throw new Error("Код не подошёл."); setSession(j, phone); push(true).catch(() => null); pull().catch(() => null); }
  async function refresh() {
    if (S?.local || !ready()) return false;
    if (!S?.refresh) return false;
    if (S.exp - Date.now() > 120000) return true;
    try { setSession(await api("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: S.refresh }) }), S.email); return true; }
    catch (e) { if (e.status === 400 || e.status === 401) { S = null; save(); } return false; }
  }
  function signOut() { const local = S?.local; if (!local) { try { push(true).catch(() => null); } catch { } } try { if (window.Store && Store.clear) Store.clear(); } catch { } try { Object.keys(localStorage).forEach(k => { if (/uchu:lessons|uchu:lesson$/i.test(k)) localStorage.removeItem(k); }); } catch { } S = null; if (window.Dev?.on) try { Dev.exit(); } catch { } save(); window.Access?.paint(); toast("Вы вышли из кабинета. Уроки сохранены в облаке и убраны из этого браузера."); }
  /* ---------- синхронизация уроков ---------- */
  let pushT = null, busy = false;
  async function upsert(rows) { if (!rows.length) return; await api("/rest/v1/lessons", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) }); }
  async function push(all = false) {
    if (!ready() || !S || busy) return; if (!(await refresh())) return;
    busy = true;
    try {
      const ls = await listLessons(), since = all ? "" : (S.pushedAt || "");
      const rows = ls.filter(L => !L.sample && String(L.updatedAt || "") > since).map(L => ({ id: L.id, user_id: S.uid, data: L, updated_at: L.updatedAt || new Date().toISOString() }));
      for (let i = 0; i < rows.length; i += 20) await upsert(rows.slice(i, i + 20));
      S.pushedAt = new Date().toISOString(); S.syncedAt = S.pushedAt; save();
    } catch (e) { console.warn("cloud push", e); } finally { busy = false; }
  }
  async function pull() {
    if (!ready() || !S) return 0; if (!(await refresh())) return 0;
    const rows = await api("/rest/v1/lessons?select=id,data,updated_at&order=updated_at.desc&limit=1000");
    const local = new Map((await listLessons()).map(L => [L.id, L])); let n = 0;
    for (const r of rows || []) { const L = local.get(r.id); if (!L || String(L.updatedAt || "") < String(r.updated_at || "")) { await Store.put("lessons", r.id, r.data); n++; } }
    await push(true); // свои локальные уроки — в облако
    S.syncedAt = new Date().toISOString(); save();
    if (n && typeof renderLibrary === "function" && state.view === "library") renderLibrary();
    return n;
  }
  async function remove(id) { if (!ready() || !S || !(await refresh())) return; try { await api(`/rest/v1/lessons?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }); } catch (e) { console.warn(e); } }
  // сохранение урока → облако (через 3 секунды тишины)
  const origSave = window.saveLesson;
  if (typeof origSave === "function") window.saveLesson = async L => { const r = await origSave(L); clearTimeout(pushT); pushT = setTimeout(() => push(), 3000); return r; };

  /* ---------- профиль учителя: имя, школа, город, фото (всё по желанию) ---------- */
  async function loadInfo() {
    if (!ready() || !S || S.local || !(await refresh())) return S?.info || null;
    try { const r = (await api(`/rest/v1/user_info?id=eq.${S.uid}&select=name,school,city,avatar`))?.[0]; if (r) { S.info = r; save(); } } catch (e) { /* таблицы ещё нет — профиль хранится на устройстве */ }
    return S?.info || null;
  }
  async function saveInfo(info) {
    if (!S) return;
    S.info = { ...(S.info || {}), ...info }; save();
    if (!ready() || S.local || !(await refresh())) return;
    try { await api("/rest/v1/user_info", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: S.uid, ...S.info, updated_at: new Date().toISOString() }) }); }
    catch (e) { console.warn("user_info", e); }
  }
  /* фото уменьшается до 160×160 (≈10 КБ), чтобы хранить прямо в профиле */
  function shrink(file) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => { const n = 160, c = document.createElement("canvas"); c.width = c.height = n; const k = Math.min(img.width, img.height), x = (img.width - k) / 2, y = (img.height - k) / 2; c.getContext("2d").drawImage(img, x, y, k, k, 0, 0, n, n); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.82)); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("не удалось открыть картинку")); };
      img.src = url;
    });
  }
  /* ---------- материалы учителей: больше не пересылаются (функция оставлена пустой для совместимости) ---------- */
  // материалы учителя остаются только у него: автору сайта не отправляются и в общую базу не встраиваются (авторские права)
  async function shareMaterial(m) {
    return;
    if (!ready() || !S || S.local || !(m.text || "").trim() || !(await refresh())) return;
    const row = { id: (S.uid || "").slice(0, 8) + ":" + (m.hash || m.id), user_id: S.uid, email: S.email, name: m.name, title: m.title || null, kind: m.kind || null, type: m.type || null, subject: m.subject || null, grade: Number.isFinite(+m.grade) && m.grade ? +m.grade : null, topic: m.topic || null, text: String(m.text).slice(0, 400000), chars: (m.text || "").length };
    try { await api("/rest/v1/shared_materials", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(row) }); } catch (e) { console.warn("shared_materials", e); }
  }
  async function sharedList() {
    if (!ready() || !S || S.local) throw new Error("Войдите в личный кабинет (вверху справа) — присланные материалы видны только автору сайта.");
    if (!(await refresh())) throw new Error("Войдите в личный кабинет заново.");
    return await api("/rest/v1/shared_materials?select=id,email,name,title,kind,type,subject,grade,topic,chars,created_at&order=created_at.desc&limit=500") || [];
  }
  async function sharedGet(id) { await refresh(); return (await api(`/rest/v1/shared_materials?id=eq.${encodeURIComponent(id)}&select=*`))?.[0] || null; }
  async function sharedDel(id) { await refresh(); await api(`/rest/v1/shared_materials?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }); }

  const PLAN_NAMES = { promo: "бесплатный", free: "бесплатный", basic: "«Учитель» (без ИИ)", ai: "«Учитель + ИИ»", pro: "«Методист»" };
  async function plan() {
    try {
      if (!(await refresh())) return null;
      const q = f => api(`/rest/v1/profiles?id=eq.${S.uid}&select=${f}`);
      const p = (await q("plan,ai_left,paid_until,promo,promo_pct,promo_free_code,tokens_used,tokens_limit").catch(() => q("plan,ai_left,paid_until,promo,tokens_used,tokens_limit")).catch(() => q("plan,ai_left,paid_until,promo")).catch(() => q("plan,ai_left,paid_until")))?.[0] || null; // новых колонок может ещё не быть
      // бесплатный доступ по промокоду — только пока код существует и включён (проверяет облако, сами коды не видны)
      const freeOk = p?.promo_free_code ? !!(await api("/rest/v1/rpc/promo_free_ok", { method: "POST", body: "{}" }).catch(() => false)) : false;
      const forever = p?.plan === "pro" && p?.paid_until && new Date(p.paid_until).getFullYear() >= 2090; // бесплатный доступ, открытый через тариф без срока
      if (p && S) { S.plan = p.plan; S.promoFree = freeOk || forever; S.promoPct = p.promo_pct || null; S.promo = !freeOk && (!!p.promo || p.plan === "promo"); S.tokens = typeof p.tokens_limit === "number" ? { used: p.tokens_used || 0, limit: p.tokens_limit || 0 } : null; save(); window.Access?.paint(); }
      return p;
    } catch { return null; }
  }
  /* Карточка тарифа в кабинете: всё, что оплачено и сколько осталось — с самого начала */
  const TOK = { free: 0, basic: 0, ai: 2000000, pro: 4800000 };
  function planCard(p) {
    const plan = S?.promoFree ? "pro" : p ? (p.plan === "promo" ? "free" : p.plan) : "free";
    const name = PLAN_NAMES[plan] || plan, dev = window.Access?.isDev?.();
    const until = p?.paid_until && plan !== "free" ? new Date(p.paid_until) : null, days = until ? Math.max(0, Math.ceil((until - Date.now()) / 864e5)) : null;
    const hasTok = typeof p?.tokens_limit === "number";
    const lim = hasTok ? p.tokens_limit : TOK[plan] || 0, used = hasTok ? Math.min(p.tokens_used || 0, Math.max(lim, p.tokens_used || 0)) : 0, left = Math.max(0, lim - used);
    const pct = lim ? Math.round(used / lim * 100) : 0;
    const row = (k, v) => `<div class="pc-row"><span>${k}</span><b>${v}</b></div>`;
    let h = `<div class="plan-card"><div class="pc-head"><span class="pc-name">${esc(name)}</span>${S.promoFree ? `<span class="tag ok">бесплатный доступ по промокоду</span>` : S.promo ? `<span class="tag ok">промокод −${S.promoPct || 50}%</span>` : ""}${dev ? `<span class="tag">вы — разработчик: всё открыто</span>` : ""}</div>`;
    if (S?.promoFree) { h += row("Доступ", "все возможности сайта, без оплаты и без срока") + (window.Usage ? Usage.html({}) : "") + "</div>"; return h; }
    h += row("Оплачено до", until ? `${until.toLocaleDateString("ru-RU")} (ещё ${days} дн.)` : plan === "free" ? "бесплатно, без срока" : "—");
    h += row("Уроки без ИИ", plan === "free" ? `3 в месяц (осталось ${window.Access?.lessonsLeft?.() === Infinity ? "∞" : window.Access?.lessonsLeft?.() ?? 3})` : "без ограничений");
    if (S.promo) h += row("ИИ", "своя нейросеть (ваш ключ)");
    else if (!lim && !dev) h += row("ИИ сайта", "не входит в тариф");
    // расход в ⚡ (1 ⚡ = 4 000 токенов): по тарифу — с сервера, у разработчика и со своим ключом — журнал этого браузера
    if (window.Usage && (lim || dev || S.promo || Usage.stats().ops.length)) h += Usage.html({ dev, planTok: !dev && !S.promo && lim ? lim : 0, usedTok: !dev && !S.promo && lim && hasTok ? used : null });
    h += "</div>";
    return h;
  }
  /* Расход ИИ по тарифу: полоска «потрачено из доступного» */
  const kTok = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(".", ",") + " млн" : Math.round(n / 1000) + " тыс.";
  function tokLine(p) {
    const lim = p.tokens_limit || 0, used = Math.min(p.tokens_used || 0, lim || p.tokens_used || 0), left = Math.max(0, lim - used);
    if (!lim) return "<br><b>ИИ сайта:</b> не входит в тариф";
    const pct = Math.round(used / lim * 100);
    const U = n => window.Usage ? Usage.fmt(n) : kTok(n); return `<div class="tok-bar" role="img" aria-label="Потрачено ${pct}%"><span style="width:${pct}%"></span></div><span class="small"><b>ИИ:</b> потрачено ${U(used)} из ${U(lim)} · осталось ≈ ${Math.floor(left / 40000)} уроков с ИИ</span>`;
  }
  /* Неприметный вход разработчика — в самом низу окна кабинета, справа */
  const devLink = () => ""; /* вход разработчика только на /dev.html */
  function bindDev(m) { m.querySelectorAll("[data-ava]").forEach(b => b.onclick = async () => {
      try {
        const info = { ...(S.info || {}), avatar: b.dataset.ava };
        await saveInfo(info);
        toast("Аватар обновлён.");
        closeModal(); open(); paint(); paintNav();
      } catch (e) { toast("Не удалось сохранить аватар: " + e.message, 6000); }
    });
  const b = m.querySelector("#acDev"); if (b) b.onclick = () => { closeModal(); if (window.Dev?.on) window.Dev.show("files"); else window.Dev?.openLogin(); }; }
  /* ---------- окно кабинета ---------- */
  function open() {
    if (S) {
      const I = S.info || {};
      const m = openModal(`<div class="dialog narrow"><div class="dlg-h"><h2>Личный кабинет</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div><div class="dlg-b">
        <form class="ac-prof" id="acProf">
          <label class="ac-ava" title="Нажмите, чтобы выбрать фото">${I.avatar ? `<img src="${esc(I.avatar)}" alt="">` : `<span>${esc(initials(I.name) || "👤")}</span>`}<input type="file" id="acPhoto" accept="image/*" hidden><em>${I.avatar ? "сменить" : "фото"}</em></label>
          <div class="ac-ava-set" id="acAvaSet">
            <span class="small">Или выберите готовый:</span>
            <div class="ac-ava-grid">${[1,2,3,4,5,6,7].map(i=>`<button type="button" class="ac-ava-btn" data-ava="js/avatars/a${i}.png?v=3" title="Без фона"><img src="js/avatars/a${i}.png?v=3" alt=""></button>`).join("")}${[1,2,3,4,5,6,7].map(i=>`<button type="button" class="ac-ava-btn" data-ava="js/avatars/a${i}w.png?v=3" title="На белом"><img src="js/avatars/a${i}w.png?v=3" alt=""></button>`).join("")}</div>
          </div>
          <div class="ac-fields">
            <input type="text" id="acName" placeholder="Имя и фамилия" value="${esc(I.name || "")}" autocomplete="name">
            <input type="text" id="acSchool" placeholder="Школа (по желанию)" value="${esc(I.school || "")}" autocomplete="organization">
            <input type="text" id="acCity" placeholder="Город (по желанию)" value="${esc(I.city || "")}" autocomplete="address-level2">
            <div class="row-btn"><button class="btn sm" type="submit">Сохранить</button>${I.avatar ? `<button class="btn sm ghost" type="button" id="acNoPhoto">Убрать фото</button>` : ""}<span class="small" id="acPMsg" role="status"></span></div>
          </div>
        </form>
        <div class="acc-plan" id="acPlan"><b>Тариф:</b> загружаю…</div>
        <div class="mat-row">${window.Access?.commercial() ? `<button class="btn sm" id="acPlans">Тарифы и промокод</button>` : ""}<button class="btn sm ghost" id="acOut">Выйти</button></div>${devLink()}</div></div>`);
      bindDev(m);
      m.querySelector("#acPlans")?.addEventListener("click", () => { closeModal(); Access.open(); });
      const pm = m.querySelector("#acPMsg");
      const fields = () => ({ name: m.querySelector("#acName").value.trim(), school: m.querySelector("#acSchool").value.trim(), city: m.querySelector("#acCity").value.trim() });
      m.querySelector("#acProf").onsubmit = async e => { e.preventDefault(); pm.textContent = "Сохраняю…"; await saveInfo(fields()); pm.textContent = "Сохранено ✓"; };
      m.querySelector("#acPhoto").onchange = async e => { const f = e.target.files?.[0]; if (!f) return; try { pm.textContent = "Загружаю фото…"; await saveInfo({ ...fields(), avatar: await shrink(f) }); closeModal(); open(); } catch (er) { pm.textContent = "Не получилось: " + er.message; } };
      m.querySelector("#acNoPhoto")?.addEventListener("click", async () => { await saveInfo({ ...fields(), avatar: null }); closeModal(); open(); });
      (S.local ? Promise.resolve(null) : plan()).then(p => { const el = m.querySelector("#acPlan"); if (el) el.innerHTML = planCard(p); });
      if (m.querySelector("#acSync")) m.querySelector("#acSync").onclick = async e => { e.target.disabled = true; e.target.textContent = "Синхронизирую…"; try { const n = await pull(); toast(n ? `Получено из облака уроков: ${n}.` : "Всё синхронизировано."); } catch (er) { toast("Не получилось: " + RU(er.message)); } closeModal(); };
      m.querySelector("#acOut").onclick = () => { closeModal(); signOut(); };
      return;
    }
    const m = openModal(`<div class="dialog narrow"><div class="dlg-h"><h2>Вход в личный кабинет</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div>
      <form class="dlg-b" id="acForm" autocomplete="on">
        <div class="seg mini" role="tablist"><button type="button" data-mode="in" aria-pressed="true">Вход</button><button type="button" data-mode="up" aria-pressed="false">Регистрация</button></div>
        ${(window.UCHU_SITE || {}).phoneAuth ? `<div class="seg mini" role="tablist" id="acVia"><button type="button" data-via="mail" aria-pressed="true">По почте</button><button type="button" data-via="phone" aria-pressed="false">По телефону</button></div>` : ""}
        <div id="acPhoneBox" hidden><div class="field"><label for="acPhone">Телефон</label><input type="tel" id="acPhone" autocomplete="tel" placeholder="+7 900 000-00-00" inputmode="tel"></div><div class="field" id="acCodeF" hidden><label for="acCode">Код из SMS</label><input type="text" id="acCode" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456"></div></div>
        <div class="field" data-mailf><label for="acEmail">Почта</label><input type="email" id="acEmail" name="email" autocomplete="username" required></div>
        <div class="field" data-mailf><label for="acPass">Пароль</label><div class="pw-wrap"><input type="password" id="acPass" name="password" autocomplete="current-password" minlength="6" required><button type="button" class="pw-eye" id="acEye" aria-label="Показать пароль" title="Показать пароль">👁</button></div></div>
        <div class="small" id="acForgotW" style="margin:-4px 0 10px"><button type="button" id="acForgot" class="link" style="background:none;border:0;padding:0;color:inherit;text-decoration:underline;cursor:pointer;font:inherit">Забыли пароль?</button></div>
        <label class="check ac-agree" id="acAgreeL" hidden style="align-items:flex-start;border:0;padding:0;background:none;font-weight:500;font-size:13.5px"><input type="checkbox" id="acAgree"> <span>Принимаю <a href="legal/oferta.html" target="_blank">договор-оферту</a> и даю согласие на обработку персональных данных по <a href="legal/privacy.html" target="_blank">политике конфиденциальности</a></span></label>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn flame" type="submit" id="acGo">Войти</button><span class="small" id="acMsg" role="status"></span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <button class="btn sm" type="button" id="acGoogle"><svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" style="vertical-align:-2px;margin-right:6px"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.2l7.8 6.1C12.2 13.2 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.5c-.5 2.9-2.2 5.4-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 7.1-17z"/><path fill="#FBBC05" d="M10.3 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.5l-7.1-5.5c-2 1.4-4.7 2.3-8.2 2.3-6.4 0-11.8-3.7-13.7-8.8l-7.8 6.1C6.4 42.6 14.6 48 24 48z"/></svg>Войти через Google</button>
          <button class="btn sm" type="button" id="acYandex"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style="vertical-align:-2px;margin-right:6px"><circle cx="12" cy="12" r="12" fill="#FC3F1D"/><path fill="#fff" d="M13.6 7.6h-1.2c-1.5 0-2.2.7-2.2 1.8 0 1.2.5 1.8 1.9 2.5l1.2.6-2.9 4.6h-1.8l2.6-4.1c-1.6-.8-2.4-1.7-2.4-3.3 0-2.1 1.4-3.5 3.8-3.5h2.8v10.9h-1.6V7.6z"/></svg>Войти через Яндекс</button>
        </div>
        <p class="small" style="margin-top:6px">Первый вход через Google или Яндекс — это регистрация: кабинет создаётся сам. Дальше входите этой же кнопкой — без почты и пароля. </p>
        ${devLink()}
      </form></div>`);
    bindDev(m);
    let mode = "in";
    const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const oauth = async provider => {
      if (!ready()) { toast("Вход через " + provider + " временно недоступен.", 5000); return; }
      try {
        const ver = b64url(crypto.getRandomValues(new Uint8Array(32)));
        const dig = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ver));
        sessionStorage.setItem("uchu:pkce", ver);
        const back = location.origin + location.pathname;
        location.href = C().url.replace(/\/+$/, "") + "/auth/v1/authorize?provider=" + encodeURIComponent(provider)
          + "&redirect_to=" + encodeURIComponent(back);
      } catch (e) { toast("Не удалось открыть вход через " + provider + ": " + e.message, 6000); }
    };
    const gb = m.querySelector("#acGoogle"), yb = m.querySelector("#acYandex");
    if (gb) gb.onclick = () => oauth("google");
    if (yb) yb.onclick = () => { location.href = "https://functions.yandexcloud.net/d4ek0q8grbhn7q5muf24?path=/auth/yandex&site=" + encodeURIComponent(location.origin + location.pathname); };
    m.querySelector("#acEye").onclick = () => { const i = m.querySelector("#acPass"), show = i.type === "password"; i.type = show ? "text" : "password"; m.querySelector("#acEye").textContent = show ? "🙈" : "👁"; m.querySelector("#acEye").setAttribute("aria-label", show ? "Скрыть пароль" : "Показать пароль"); i.focus(); };
    m.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { mode = b.dataset.mode; m.querySelectorAll("[data-mode]").forEach(x => x.setAttribute("aria-pressed", x === b)); m.querySelector("#acGo").textContent = mode === "in" ? "Войти" : "Зарегистрироваться"; m.querySelector("#acAgreeL").hidden = via === "phone" ? false : mode !== "up"; m.querySelector("#acPass").autocomplete = mode === "in" ? "current-password" : "new-password"; m.querySelector("#acForgotW").hidden = mode !== "in" || via === "phone"; });
    let via = "mail", codeSent = false, cool = 0, coolT = null;
    m.querySelector("#acForgot").onclick = async () => {
      const email = m.querySelector("#acEmail").value.trim(), msg = m.querySelector("#acMsg");
      if (!/^\S+@\S+\.\S+$/.test(email)) { msg.textContent = "Впишите свою почту в поле выше, потом снова нажмите «Забыли пароль?»."; m.querySelector("#acEmail").focus(); return; }
      msg.textContent = "Отправляю письмо…";
      try { await recover(email); msg.textContent = "Если эта почта зарегистрирована, мы отправили на неё письмо со ссылкой для нового пароля. Проверьте и «Спам»."; }
      catch (er) { msg.textContent = RU(er.message); }
    };
    const afterLogin = () => {
      closeModal(); toast("Вы вошли. Уроки сохраняются в личном кабинете.");
      window.Access?.paint(); plan().then(() => window.Access?.paint()).catch(() => null); loadInfo().catch(() => null);
      let want = window.Access?.wantBuy; try { want = want || localStorage.getItem("uchu:want-buy"); localStorage.removeItem("uchu:want-buy"); } catch { }
      if (want && window.Access) { Access.wantBuy = null; Access.checkout(want); }
      else if (window.Access?.wantPromo) { Access.wantPromo = false; Access.open(); }
    };
    const setVia = v => {
      via = v; m.querySelectorAll("[data-via]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.via === v)));
      m.querySelector("#acPhoneBox").hidden = v !== "phone"; m.querySelectorAll("[data-mailf]").forEach(f => { f.hidden = v === "phone"; f.querySelector("input").required = v !== "phone"; });
      m.querySelector("#acAgreeL").hidden = v === "phone" ? false : mode !== "up"; m.querySelector("#acForgotW").hidden = mode !== "in" || v === "phone";
      m.querySelector("#acGo").textContent = v === "phone" ? (codeSent ? "Войти" : "Получить код") : (mode === "in" ? "Войти" : "Зарегистрироваться");
    };
    m.querySelectorAll("[data-via]").forEach(b => b.onclick = () => setVia(b.dataset.via));
    const phoneSubmit = async () => {
      const msg = m.querySelector("#acMsg"), phone = normPhone(m.querySelector("#acPhone").value), go = m.querySelector("#acGo");
      if (!phone) { msg.textContent = "Введите российский номер: +7 900 000-00-00."; return; }
      if (!m.querySelector("#acAgree").checked) { msg.textContent = "Отметьте согласие с офертой и политикой конфиденциальности."; return; }
      if (go.disabled) return; go.disabled = true;
      try {
        if (!codeSent) {
          msg.textContent = "Отправляю код…"; await phoneCode(phone); codeSent = true; m.querySelector("#acCodeF").hidden = false; m.querySelector("#acCode").focus();
          msg.textContent = "Код отправлен по SMS на " + phone + "."; go.textContent = "Войти"; cool = 60; clearInterval(coolT);
          coolT = setInterval(() => { cool--; if (cool <= 0) { clearInterval(coolT); } }, 1000);
        } else {
          const code = m.querySelector("#acCode").value.trim(); if (!/^\d{4,8}$/.test(code)) { msg.textContent = "Введите код из SMS."; return; }
          msg.textContent = "Проверяю код…"; await phoneVerify(phone, code); afterLogin();
        }
      } catch (er) { msg.textContent = /rate|too many|429/i.test(er.message) ? "Код уже отправляли — подождите минуту и попробуйте снова." : /token|expired|invalid|otp/i.test(er.message) ? "Код неверный или устарел. Запросите новый." : "Не получилось: " + er.message; if (codeSent && /устарел|неверн/.test(msg.textContent)) { codeSent = false; m.querySelector("#acCodeF").hidden = true; go.textContent = "Получить код"; } }
      finally { go.disabled = false; }
    };
    m.querySelector("#acForm").onsubmit = async e => {
      if (via === "phone") { e.preventDefault(); return phoneSubmit(); }
      e.preventDefault(); const email = m.querySelector("#acEmail").value.trim(), pass = m.querySelector("#acPass").value, msg = m.querySelector("#acMsg");
      if (pass.length < 6) { msg.textContent = "Пароль — не короче 6 знаков."; return; }
      if (mode === "up" && !m.querySelector("#acAgree").checked) { msg.textContent = "Отметьте согласие с офертой и политикой конфиденциальности."; return; }
      msg.textContent = mode === "in" ? "Вхожу…" : "Создаю кабинет…";
      const go = m.querySelector("#acGo"); if (go.disabled) return; go.disabled = true;
      try {
        if (mode === "up") { const r = await signUp(email, pass); if (r === "confirm") { msg.innerHTML = "Почти готово! Мы отправили письмо на <b>" + email + "</b>. Откройте его и нажмите ссылку подтверждения." +
          '<div style="margin-top:12px;padding:12px;border:1px dashed var(--rule);border-radius:12px;text-align:left">' +
          "<b>Следующий шаг — привязать мессенджер.</b><br>Откройте бота и отправьте ему вашу почту <b>" + email + "</b> — чат привяжется к аккаунту автоматически.<br>" +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' +
          '<a class="btn sm" href="https://t.me/Uchu_po_frp_bot" target="_blank" rel="noopener">Telegram</a>' +
          '<a class="btn sm" href="https://max.ru/se14825349_bot" target="_blank" rel="noopener">MAX</a></div></div>'; return; } }
        else await signIn(email, pass);
        if (window.PasswordCredential) { try { navigator.credentials.store(new PasswordCredential({ id: email, password: pass })).catch(() => null); } catch { } } // не ждём: окно браузера «сохранить пароль» не должно держать вход
        closeModal(); toast("Вы вошли. Уроки сохраняются в личном кабинете.");
        window.Access?.paint(); plan().then(() => window.Access?.paint()).catch(() => null); loadInfo().catch(() => null);
        // выбранный тариф помним и после подтверждения почты (письмо открывает сайт заново)
        let want = window.Access?.wantBuy; try { want = want || localStorage.getItem("uchu:want-buy"); localStorage.removeItem("uchu:want-buy"); } catch { }
        if (want && window.Access) { Access.wantBuy = null; Access.checkout(want); }
        else if (window.Access?.wantPromo) { Access.wantPromo = false; Access.open(); }
        else if (window.Dev?.wantDev) { Dev.wantDev = false; Dev.openLogin(); }
      } catch (er) {
        msg.textContent = RU(er.message);
        if (/not confirmed|confirm/i.test(er.message) && mode === "in") { // старый аккаунт без подтверждения: даём отправить письмо ещё раз
          const b = document.createElement("button"); b.type = "button"; b.className = "btn sm ghost"; b.style.marginLeft = "8px"; b.textContent = "Отправить письмо ещё раз";
          b.onclick = async () => { b.disabled = true; try { await resendConfirm(email); msg.textContent = "Письмо отправлено на " + email + ". Откройте его и нажмите ссылку."; } catch (e2) { msg.textContent = RU(e2.message); } };
          msg.appendChild(b);
        }
      }
      finally { go.disabled = false; }
    };
  }
  /* ---------- кнопка в шапке ---------- */
  const btn = document.createElement("button"); btn.type = "button"; btn.className = "acc-btn"; btn.id = "btnAccount"; btn.onclick = open;
  const initials = n => String(n || "").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase();
  function paint() {
    const I = S?.info || {};
    if (!S) { btn.innerHTML = "Войти"; btn.setAttribute("aria-label", "Войти в личный кабинет"); }
    else {
      const pic = I.avatar || S.pic || "";
      const nm = I.name || (S.local ? "Кабинет" : "Кабинет");
      const ini = initials(nm) || "👤";
      btn.innerHTML = pic ? `<img class="acc-ava" src="${esc(pic)}" alt="">` : `<span class="acc-ini">${esc(ini)}</span>`;
      btn.setAttribute("aria-label", "Личный кабинет: " + nm);
    }
    btn.title = S ? "Личный кабинет" : "Войти в личный кабинет";
  }
  const navBtn = () => document.getElementById("navAuth");
  function paintNav() {
    const nb = navBtn(); if (!nb) return;
    if (!S) { nb.innerHTML = "Войти"; nb.onclick = open; return; }
    const I = S?.info || {};
    const pic = I.avatar || S.pic || "";
    const nm = I.name || (S.local ? "Кабинет" : "Кабинет");
    nb.innerHTML = (pic ? `<img class="acc-ava" src="${esc(pic)}" alt="">` : "") + esc(nm.split(/\s+/).slice(0, 2).join(" ") || "Кабинет");
    nb.onclick = open;
  }
  document.addEventListener("DOMContentLoaded", () => { paint(); paintNav(); });
  document.addEventListener("uchu:auth", paintNav);
  setInterval(paintNav, 1500);

  async function fromCode() {
    const q = new URLSearchParams(location.search);
    const code = q.get("code"); if (!code) return false;
    history.replaceState(null, "", location.pathname);
    const ver = sessionStorage.getItem("uchu:pkce") || "";
    try {
      const j = await api("/auth/v1/token?grant_type=pkce", { method: "POST", body: JSON.stringify({ auth_code: code, code_verifier: ver }) });
      sessionStorage.removeItem("uchu:pkce");
      if (!j || !j.access_token) { toast("Вход не удался: сервер не вернул сессию.", 7000); return false; }
      setSession(j, j.user?.email || "");
      closeModal(); toast("Вы вошли в личный кабинет."); paint(); paintNav(); afterOAuth();
      pull().catch(() => null); loadInfo().catch(() => null);
      return true;
    } catch (e) { toast("Вход не удался: " + (e.message || "ошибка"), 7000); return false; }
  }
  function bootAuth() {
    if (/access_token|error_description/.test(location.hash)) { fromLink(); return true; }
    if (/[?&]code=/.test(location.search)) { fromCode(); return true; }
    if (S && ready()) { pull().catch(() => null); loadInfo().catch(() => null); paint(); paintNav(); }
    return false;
  }
  document.addEventListener("uchu:ready", bootAuth);
  document.addEventListener("DOMContentLoaded", () => {
    let n = 0;
    const tick = () => { if (bootAuth() || S || n++ > 20) { clearInterval(iv); } else { paint(); paintNav(); } };
    const iv = setInterval(tick, 500);
    setTimeout(tick, 100);
  });
  paint();
  // запрос к облаку от имени вошедшего (права — по правилам таблиц)
  async function db(path, opt = {}) { if (!ready() || !S || S.local) throw new Error("войдите в личный кабинет"); if (!(await refresh())) throw new Error("войдите в личный кабинет заново"); return api(path, opt); }
  return { open, db, refreshPlan: () => plan(), shareMaterial, sharedList, sharedGet, sharedDel, loadInfo, saveInfo, signIn, signUp, signOut, push, pull, remove, ready, get session() { return S; } };
})();
window.Account = Account;
