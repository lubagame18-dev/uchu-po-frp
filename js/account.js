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
  async function fromLink() {
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (h.get("error_description")) { history.replaceState(null, "", location.pathname + location.search); toast("Ссылка из письма устарела или уже использована. Просто войдите с почтой и паролем.", 8000); return; }
    const at = h.get("access_token"), rt = h.get("refresh_token"); if (!at || !rt || !ready()) return;
    history.replaceState(null, "", location.pathname + location.search);
    try {
      const u = await api("/auth/v1/user", { headers: { Authorization: "Bearer " + at } });
      setSession({ access_token: at, refresh_token: rt, expires_in: +h.get("expires_in") || 3600, user: u }, u.email);
      toast("Почта подтверждена — вы вошли в личный кабинет.", 6000);
      await pull().catch(() => null); await plan().catch(() => null); loadInfo().catch(() => null);
      let want = null; try { want = localStorage.getItem("uchu:want-buy"); localStorage.removeItem("uchu:want-buy"); } catch { }
      if (want && window.Access) Access.checkout(want);
    } catch (e) { toast("Не удалось войти по ссылке: " + RU(e.message) + " Войдите с почтой и паролем.", 8000); }
  }
  function setSession(j, email) { S = { email: j.user?.email || email, uid: j.user?.id, access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }; save(); }
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
  async function refresh() {
    if (S?.local || !ready()) return false;
    if (!S?.refresh) return false;
    if (S.exp - Date.now() > 120000) return true;
    try { setSession(await api("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: S.refresh }) }), S.email); return true; }
    catch (e) { if (e.status === 400 || e.status === 401) { S = null; save(); } return false; }
  }
  function signOut() { const local = S?.local; S = null; if (window.Dev?.on) try { Dev.exit(); } catch { } save(); window.Access?.paint(); toast(local ? "Вы вышли из кабинета." : "Вы вышли из кабинета. Уроки в облаке сохранены."); }
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
  /* ---------- материалы учителей → автору сайта (видны в режиме разработчика) ---------- */
  async function shareMaterial(m) {
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
      if (p && S) { S.plan = p.plan; S.promoFree = freeOk; S.promoPct = p.promo_pct || null; S.promo = !freeOk && (!!p.promo || p.plan === "promo"); S.tokens = typeof p.tokens_limit === "number" ? { used: p.tokens_used || 0, limit: p.tokens_limit || 0 } : null; save(); window.Access?.paint(); }
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
    h += `<details class="pc-how"><summary class="small">Сколько ⚡ в тарифах</summary><table class="pc-t"><tr><th>Тариф</th><th>⚡ в месяц</th><th>≈ уроков с ИИ</th></tr><tr><td>Бесплатный</td><td>—</td><td>—</td></tr><tr><td>Учитель</td><td>—</td><td>—</td></tr><tr><td>Учитель + ИИ</td><td>500 ⚡</td><td>50</td></tr><tr><td>Методист</td><td>1 200 ⚡</td><td>120</td></tr><tr><td>+10 уроков</td><td>+100 ⚡</td><td>+10</td></tr><tr><td>+30 уроков</td><td>+300 ⚡</td><td>+30</td></tr></table><p class="small">Урок с ИИ (конспект, презентация, лист) ≈ 10 ⚡, пересборка одного документа ≈ 3 ⚡, правка по просьбе ≈ 1 ⚡. Списывается точный расход каждого запроса; новый месяц — новый запас.</p></details>`;
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
  const devLink = () => `<div class="ac-dev"><button type="button" class="foot-dev" id="acDev">${window.Dev?.on ? "🛠 Разделы разработчика" : "🛠 Вход разработчика"}</button></div>`;
  function bindDev(m) { const b = m.querySelector("#acDev"); if (b) b.onclick = () => { closeModal(); if (window.Dev?.on) window.Dev.show("files"); else window.Dev?.openLogin(); }; }
  /* ---------- окно кабинета ---------- */
  function open() {
    if (S) {
      const I = S.info || {};
      const m = openModal(`<div class="dialog narrow"><div class="dlg-h"><h2>Личный кабинет</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div><div class="dlg-b">
        <form class="ac-prof" id="acProf">
          <label class="ac-ava" title="Нажмите, чтобы выбрать фото">${I.avatar ? `<img src="${esc(I.avatar)}" alt="">` : `<span>${esc(initials(I.name) || "👤")}</span>`}<input type="file" id="acPhoto" accept="image/*" hidden><em>${I.avatar ? "сменить" : "фото"}</em></label>
          <div class="ac-fields">
            <input type="text" id="acName" placeholder="Имя и фамилия" value="${esc(I.name || "")}" autocomplete="name">
            <input type="text" id="acSchool" placeholder="Школа (по желанию)" value="${esc(I.school || "")}" autocomplete="organization">
            <input type="text" id="acCity" placeholder="Город (по желанию)" value="${esc(I.city || "")}" autocomplete="address-level2">
            <div class="row-btn"><button class="btn sm" type="submit">Сохранить</button>${I.avatar ? `<button class="btn sm ghost" type="button" id="acNoPhoto">Убрать фото</button>` : ""}<span class="small" id="acPMsg" role="status"></span></div>
          </div>
        </form>
        <p class="small">Почта для входа: ${esc(S.email)}</p>
        ${S.local ? `<p class="small">Ваши уроки сохраняются в личном кабинете. Для надёжности можно сохранить их и в файл: «Мои уроки» → «Скачать все уроки».</p>` : `<p class="small">Уроки сохраняются в облаке автоматически${S.syncedAt ? `; последняя синхронизация — ${new Date(S.syncedAt).toLocaleString("ru-RU")}` : ""}. Они не пропадут при очистке браузера и появятся на любом устройстве после входа.</p>`}
        <div class="acc-plan" id="acPlan"><b>Тариф:</b> загружаю…</div>
        <div class="mat-row">${S.local ? "" : `<button class="btn sm flame" id="acSync">Синхронизировать сейчас</button>`}${window.Access?.commercial() ? `<button class="btn sm" id="acPlans">Тарифы и промокод</button>` : ""}<button class="btn sm ghost" id="acOut">Выйти</button></div>${devLink()}</div></div>`);
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
        <div class="field"><label for="acEmail">Почта</label><input type="email" id="acEmail" name="email" autocomplete="username" required></div>
        <div class="field"><label for="acPass">Пароль</label><div class="pw-wrap"><input type="password" id="acPass" name="password" autocomplete="current-password" minlength="6" required><button type="button" class="pw-eye" id="acEye" aria-label="Показать пароль" title="Показать пароль">👁</button></div><span class="small">Любой, от 6 знаков — без требований к символам.</span></div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn flame" type="submit" id="acGo">Войти</button><span class="small" id="acMsg" role="status"></span></div>
        <p class="hint">Вход запоминается на этом устройстве. Уроки из этого браузера тоже перенесутся в облако.</p>
        ${devLink()}
      </form></div>`);
    bindDev(m);
    let mode = "in";
    m.querySelector("#acEye").onclick = () => { const i = m.querySelector("#acPass"), show = i.type === "password"; i.type = show ? "text" : "password"; m.querySelector("#acEye").textContent = show ? "🙈" : "👁"; m.querySelector("#acEye").setAttribute("aria-label", show ? "Скрыть пароль" : "Показать пароль"); i.focus(); };
    m.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { mode = b.dataset.mode; m.querySelectorAll("[data-mode]").forEach(x => x.setAttribute("aria-pressed", x === b)); m.querySelector("#acGo").textContent = mode === "in" ? "Войти" : "Зарегистрироваться"; m.querySelector("#acPass").autocomplete = mode === "in" ? "current-password" : "new-password"; });
    m.querySelector("#acForm").onsubmit = async e => {
      e.preventDefault(); const email = m.querySelector("#acEmail").value.trim(), pass = m.querySelector("#acPass").value, msg = m.querySelector("#acMsg");
      if (pass.length < 6) { msg.textContent = "Пароль — не короче 6 знаков."; return; }
      msg.textContent = mode === "in" ? "Вхожу…" : "Создаю кабинет…";
      const go = m.querySelector("#acGo"); if (go.disabled) return; go.disabled = true;
      try {
        if (mode === "up") { const r = await signUp(email, pass); if (r === "confirm") { msg.textContent = "Почти готово! Мы отправили письмо на " + email + ". Откройте его, нажмите ссылку подтверждения и войдите здесь."; return; } }
        else await signIn(email, pass);
        if (window.PasswordCredential) { try { navigator.credentials.store(new PasswordCredential({ id: email, password: pass })).catch(() => null); } catch { } } // не ждём: окно браузера «сохранить пароль» не должно держать вход
        closeModal(); toast("Вы вошли. Уроки сохраняются в личном кабинете.");
        window.Access?.paint(); plan().then(() => window.Access?.paint()).catch(() => null); loadInfo().catch(() => null);
        // выбранный тариф помним и после подтверждения почты (письмо открывает сайт заново)
        let want = window.Access?.wantBuy; try { want = want || localStorage.getItem("uchu:want-buy"); localStorage.removeItem("uchu:want-buy"); } catch { }
        if (want && window.Access) { Access.wantBuy = null; Access.checkout(want); }
        else if (window.Access?.wantPromo) { Access.wantPromo = false; Access.open(); }
        else if (window.Dev?.wantDev) { Dev.wantDev = false; Dev.openLogin(); }
      } catch (er) { msg.textContent = RU(er.message); }
      finally { go.disabled = false; }
    };
  }
  /* ---------- кнопка в шапке ---------- */
  const btn = document.createElement("button"); btn.type = "button"; btn.className = "btn sm"; btn.id = "btnAccount"; btn.onclick = open;
  const initials = n => String(n || "").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase();
  function paint() {
    const I = S?.info || {};
    if (!S) btn.innerHTML = "👤 Войти";
    else btn.innerHTML = `${I.avatar ? `<img class="acc-mini" src="${esc(I.avatar)}" alt="">` : "👤 "}${esc(I.name ? I.name.split(/\s+/).slice(0, 2).join(" ") : "Кабинет")}`;
    btn.title = S ? "Личный кабинет" : "Личный кабинет: вход по почте";
  }
  document.addEventListener("DOMContentLoaded", () => { document.querySelector(".account")?.appendChild(btn); paint(); });
  document.addEventListener("uchu:ready", () => { if (/access_token|error_description/.test(location.hash)) fromLink(); else if (S && ready()) { pull().catch(() => null); loadInfo().catch(() => null); } });
  paint();
  // запрос к облаку от имени вошедшего (права — по правилам таблиц)
  async function db(path, opt = {}) { if (!ready() || !S || S.local) throw new Error("войдите в личный кабинет"); if (!(await refresh())) throw new Error("войдите в личный кабинет заново"); return api(path, opt); }
  return { open, db, refreshPlan: () => plan(), shareMaterial, sharedList, sharedGet, sharedDel, loadInfo, saveInfo, signIn, signUp, signOut, push, pull, remove, ready, get session() { return S; } };
})();
window.Account = Account;
