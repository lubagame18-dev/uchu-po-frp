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
  const save = () => { try { S ? localStorage.setItem(KEY, JSON.stringify(S)) : localStorage.removeItem(KEY); } catch { } paint(); };
  const api = async (path, opt = {}) => {
    const r = await fetch(C().url.replace(/\/+$/, "") + path, { ...opt, headers: { apikey: C().anonKey, "Content-Type": "application/json", ...(S?.access ? { Authorization: "Bearer " + S.access } : {}), ...(opt.headers || {}) } });
    const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { }
    if (!r.ok) { const e = new Error(j?.msg || j?.error_description || j?.message || j?.error || ("HTTP " + r.status)); e.status = r.status; throw e; }
    return j;
  };
  const RU = m => /invalid login|invalid_grant|credentials/i.test(m) ? "Неверная почта или пароль." : /already registered|exists/i.test(m) ? "Эта почта уже зарегистрирована — войдите." : /password.*(6|short)/i.test(m) ? "Пароль — не короче 6 знаков." : /email.*(invalid|valid)/i.test(m) ? "Проверьте адрес почты." : /confirm/i.test(m) ? "Подтвердите почту по ссылке из письма (или владелец может отключить подтверждение)." : m;
  function setSession(j, email) { S = { email: j.user?.email || email, uid: j.user?.id, access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }; save(); }
  async function signIn(email, password) { setSession(await api("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) }), email); await pull(); }
  async function signUp(email, password) {
    const j = await api("/auth/v1/signup", { method: "POST", body: JSON.stringify({ email, password }) });
    if (j.access_token) { setSession(j, email); await push(true); return "ok"; }
    return "confirm"; // в проекте включено подтверждение почты
  }
  async function refresh() {
    if (!S?.refresh) return false;
    if (S.exp - Date.now() > 120000) return true;
    try { setSession(await api("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: S.refresh }) }), S.email); return true; }
    catch (e) { if (e.status === 400 || e.status === 401) { S = null; save(); } return false; }
  }
  function signOut() { S = null; save(); toast("Вы вышли из кабинета. Уроки в облаке сохранены."); }
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

  const PLAN_NAMES = { free: "бесплатный", basic: "«Учитель» (без ИИ)", ai: "«Учитель + ИИ»", pro: "«Методист»" };
  async function plan() { try { if (!(await refresh())) return null; return (await api(`/rest/v1/profiles?id=eq.${S.uid}&select=plan,ai_left,paid_until`))?.[0] || null; } catch { return null; } }
  /* ---------- окно кабинета ---------- */
  function open() {
    if (!ready()) {
      openModal(`<div class="dialog narrow"><div class="dlg-h"><h2>Личный кабинет</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div><div class="dlg-b">
        <p>Сейчас уроки хранятся в этом браузере. Вход по почте и облачное хранение заработают, когда владелец сайта подключит облако.</p>
        <p class="hint">Пока можно сохранить все уроки в файл и перенести их на другое устройство: «Мои уроки» → «Скачать все уроки (файл)».</p></div></div>`);
      return;
    }
    if (S) {
      const m = openModal(`<div class="dialog narrow"><div class="dlg-h"><h2>Личный кабинет</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div><div class="dlg-b">
        <p>Вы вошли как <b>${esc(S.email)}</b>.</p>
        <p class="small">Уроки сохраняются в облаке автоматически${S.syncedAt ? `; последняя синхронизация — ${new Date(S.syncedAt).toLocaleString("ru-RU")}` : ""}. Они не пропадут при очистке браузера и появятся на любом устройстве после входа.</p>
        <div class="acc-plan" id="acPlan"><b>Тариф:</b> загружаю…</div>
        <div class="mat-row"><button class="btn sm flame" id="acSync">Синхронизировать сейчас</button><button class="btn sm ghost" id="acOut">Выйти</button></div></div></div>`);
      plan().then(p => { const el = m.querySelector("#acPlan"); if (el) el.innerHTML = p ? `<b>Тариф:</b> ${esc(PLAN_NAMES[p.plan] || p.plan)}${p.paid_until && p.plan !== "free" ? ` до ${new Date(p.paid_until).toLocaleDateString("ru-RU")}` : ""}<br><b>Запросов к ИИ сайта осталось:</b> ${p.ai_left ?? "—"}` : `<b>Тариф:</b> бесплатный`; });
      m.querySelector("#acSync").onclick = async e => { e.target.disabled = true; e.target.textContent = "Синхронизирую…"; try { const n = await pull(); toast(n ? `Получено из облака уроков: ${n}.` : "Всё синхронизировано."); } catch (er) { toast("Не получилось: " + RU(er.message)); } closeModal(); };
      m.querySelector("#acOut").onclick = () => { closeModal(); signOut(); };
      return;
    }
    const m = openModal(`<div class="dialog narrow"><div class="dlg-h"><h2>Вход в личный кабинет</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div>
      <form class="dlg-b" id="acForm" autocomplete="on">
        <div class="seg mini" role="tablist"><button type="button" data-mode="in" aria-pressed="true">Вход</button><button type="button" data-mode="up" aria-pressed="false">Регистрация</button></div>
        <div class="field"><label for="acEmail">Почта</label><input type="email" id="acEmail" name="email" autocomplete="username" required></div>
        <div class="field"><label for="acPass">Пароль</label><input type="password" id="acPass" name="password" autocomplete="current-password" minlength="6" required><span class="small">Любой, от 6 знаков — без требований к символам.</span></div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn flame" type="submit" id="acGo">Войти</button><span class="small" id="acMsg" role="status"></span></div>
        <p class="hint">Вход запоминается на этом устройстве. Уроки из этого браузера тоже перенесутся в облако.</p>
      </form></div>`);
    let mode = "in";
    m.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { mode = b.dataset.mode; m.querySelectorAll("[data-mode]").forEach(x => x.setAttribute("aria-pressed", x === b)); m.querySelector("#acGo").textContent = mode === "in" ? "Войти" : "Зарегистрироваться"; m.querySelector("#acPass").autocomplete = mode === "in" ? "current-password" : "new-password"; });
    m.querySelector("#acForm").onsubmit = async e => {
      e.preventDefault(); const email = m.querySelector("#acEmail").value.trim(), pass = m.querySelector("#acPass").value, msg = m.querySelector("#acMsg");
      if (pass.length < 6) { msg.textContent = "Пароль — не короче 6 знаков."; return; }
      msg.textContent = mode === "in" ? "Вхожу…" : "Создаю кабинет…";
      try {
        if (mode === "up") { const r = await signUp(email, pass); if (r === "confirm") { msg.textContent = "Готово! Подтвердите почту по ссылке из письма и войдите."; return; } }
        else await signIn(email, pass);
        if (window.PasswordCredential) { try { await navigator.credentials.store(new PasswordCredential({ id: email, password: pass })); } catch { } }
        closeModal(); toast("Вы вошли. Уроки сохраняются в облаке.");
      } catch (er) { msg.textContent = RU(er.message); }
    };
  }
  /* ---------- кнопка в шапке ---------- */
  const btn = document.createElement("button"); btn.type = "button"; btn.className = "btn sm"; btn.id = "btnAccount"; btn.onclick = open;
  function paint() { btn.textContent = S ? "👤 " + (S.email || "").split("@")[0] : "👤 Войти"; btn.title = S ? "Личный кабинет: " + S.email : "Личный кабинет: вход по почте"; }
  document.addEventListener("DOMContentLoaded", () => { document.querySelector(".account")?.appendChild(btn); paint(); });
  document.addEventListener("uchu:ready", () => { if (S && ready()) pull().catch(() => null); });
  paint();
  return { open, signIn, signUp, signOut, push, pull, remove, ready, get session() { return S; } };
})();
window.Account = Account;
